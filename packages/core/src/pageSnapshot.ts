import type { Page, FrameLocator, Locator } from 'playwright';
import yaml from 'yaml';

type PageOrFrameLocator = Page | FrameLocator;

export class PageSnapshot {
  private _frameLocators: PageOrFrameLocator[] = [];
  private _text!: string;
  private _isDisconnected: boolean = false; // Whether the snapshot is disconnected (deserialized from cache)

  constructor() {
  }

  static async create(page: Page): Promise<PageSnapshot> {
    const snapshot = new PageSnapshot();
    await snapshot._build(page);
    snapshot._frameLocators = [page]; // Store the page as the first frame locator
    return snapshot;
  }

  // Create a new method to serialize the snapshot for storage
  serialize(): string {
    return JSON.stringify({
      text: this._text
    });
  }

  // Create a static method to deserialize a stored snapshot
  static fromSerialized(serializedData: string): PageSnapshot | null {
    try {
      const data = JSON.parse(serializedData);
      if (!data || typeof data.text !== 'string') {
        return null;
      }

      const snapshot = new PageSnapshot();
      snapshot._text = data.text;
      snapshot._isDisconnected = true; // Mark as disconnected since it doesn't have frameLocators
      return snapshot;
    } catch (e) {
      console.error('Failed to deserialize PageSnapshot:', e);
      return null;
    }
  }

  /**
   * Reconnect a deserialized snapshot to a live browser page
   * This must be called before using refLocator on a deserialized snapshot
   */
  reconnect(page: Page): void {
    this._frameLocators = [page]; // Set the page as the first frame locator
    this._isDisconnected = false; // Mark as connected
  }

  /**
   * Check if this snapshot needs reconnection
   */
  needsReconnection(): boolean {
    return this._isDisconnected || this._frameLocators.length === 0;
  }

  text(): string {
    return this._text;
  }

  private async _build(page: Page) {
    const yamlDocument = await this._snapshotFrame(page);
    this._text = [
      `- Page Snapshot`,
      '```yaml',
      // Generate text directly from the returned document
      yamlDocument.toString({ indentSeq: false }).trim(),
      '```',
    ].join('\n');
  }

  private async _snapshotFrame(frame: Page | FrameLocator) {
    const frameIndex = this._frameLocators.push(frame) - 1;
    let snapshotString = '';
    try {
        snapshotString = await (frame.locator('body') as any).ariaSnapshot({ ref: true, emitGeneric: true });
    } catch (e) {
        snapshotString = `error: Could not take snapshot. Error: ${e instanceof Error ? e.message : String(e)}`;
    }

    const snapshot = yaml.parseDocument(snapshotString);

    const visit = async (node: any): Promise<unknown> => {
      if (yaml.isPair(node)) {
        await Promise.all([
          visit(node.key).then(k => node.key = k),
          visit(node.value).then(v => node.value = v)
        ]);
      } else if (yaml.isSeq(node) || yaml.isMap(node)) {
        const items = [...node.items];
        node.items = await Promise.all(items.map(visit));
      } else if (yaml.isScalar(node)) {
        if (typeof node.value === 'string') {
          const value = node.value;
          if (frameIndex > 0)
            node.value = value.replace('[ref=', `[ref=f${frameIndex}`);

          if (value.startsWith('iframe ')) {
            const ref = value.match(/\[ref=(.*)\]/)?.[1]; 
            if (ref) {
              try {
                const childFrameLocator = frame.frameLocator(`aria-ref=${ref}`);
                const childSnapshot = await this._snapshotFrame(childFrameLocator);
                return snapshot.createPair(node.value, childSnapshot);
              } catch (error) {
                return snapshot.createPair(node.value, '<could not take iframe snapshot>');
              }
            }
          }
        }
      }
      return node;
    };


    if (snapshot.contents) {
        await visit(snapshot.contents);
    } else {
        const emptyMapDoc = yaml.parseDocument('{}');
        snapshot.contents = emptyMapDoc.contents;
    }
    return snapshot; 
  }

  refLocator(ref: string): Locator {
    let frameIndex = 0;
    let frame: PageOrFrameLocator;
    let targetRef = ref;

    const match = ref.match(/^f(\d+)(.*)/);
    if (match) {
      frameIndex = parseInt(match[1], 10);
      targetRef = match[2];
    }

    if (this._isDisconnected) {
      throw new Error(`Snapshot is disconnected. Call reconnect() with a live page before using refLocator.`);
    }

    if (this._frameLocators.length === 0) {
      throw new Error(`Frame locators not initialized. Cannot find frame for ref '${ref}'.`);
    }

    if (frameIndex < 0 || frameIndex >= this._frameLocators.length) {
      throw new Error(`Validation Error: Frame index ${frameIndex} derived from ref '${ref}' is out of bounds (found ${this._frameLocators.length} frames).`);
    }
    frame = this._frameLocators[frameIndex];

    if (!frame)
      throw new Error(`Frame (index ${frameIndex}) could not be determined. Provide ref from the most current snapshot.`);

    return frame.locator(`aria-ref=${targetRef}`);
  }
}
