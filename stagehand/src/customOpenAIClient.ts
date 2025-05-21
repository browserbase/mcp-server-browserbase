import {
  AvailableModel,
  CreateChatCompletionOptions,
  LLMClient,
  Logger, 
  LogLine,
} from "@browserbasehq/stagehand";
import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionContentPartImage,
  ChatCompletionContentPartText,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { z } from "zod";

class CreateChatCompletionResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreateChatCompletionResponseError";
  }
}

function validateZodSchema(schema: z.ZodTypeAny, data: unknown) {
  try {
    schema.parse(data);
    return true;
  } catch {
    return false;
  }
}

export class CustomOpenAIClientWrapper extends LLMClient {
  public type = "openai" as const;
  private client: OpenAI;

  constructor({ modelName, client }: { modelName: string; client: OpenAI }) {
    super(modelName as AvailableModel);
    this.client = client;
    this.modelName = modelName as AvailableModel;
  }

  public hasVision: boolean = false;
  public clientOptions: Record<string, any> = {};

  async createChatCompletion<T = ChatCompletion>({
    options,
    retries = 3,
    logger, 
  }: CreateChatCompletionOptions): Promise<T> {
    const { image, requestId, ...optionsWithoutImageAndRequestId } = options;

    const effectiveLogger: Logger = logger || ((logLine: LogLine) => console.error(JSON.stringify(logLine)));

    const errorLevel = 0; 
    const infoLevel = 1;

    if (image) {
      effectiveLogger({
        message: "Image provided. Vision is not currently supported by this custom client.",
        level: errorLevel,
        auxiliary: { 
          requestId: { value: String(requestId), type: "string" },
          component: { value: "CustomOpenAIClientWrapper", type: "string" },
          imageProvided: { value: String(true), type: "boolean" },
        }, 
      });
    }

    effectiveLogger({
      message: "Creating chat completion with CustomOpenAIClientWrapper",
      level: infoLevel,
      auxiliary: { 
        options: { value: JSON.stringify({ ...optionsWithoutImageAndRequestId, requestId }), type: "object" },
        modelName: { value: this.modelName, type: "string" },
        component: { value: "CustomOpenAIClientWrapper", type: "string" },
      },
    });
    
    let responseFormatPayload: { type: "json_object" } | undefined = undefined;
    if (options.response_model && options.response_model.schema) {
        responseFormatPayload = { type: "json_object" };
    }

    const { response_model, ...openaiOptions } = {
      ...optionsWithoutImageAndRequestId,
      model: this.modelName,
    };

    const formattedMessages: ChatCompletionMessageParam[] = options.messages.map(
      (message): ChatCompletionMessageParam => {
        if (typeof message.content === 'string') {
          return message as ChatCompletionMessageParam;
        }
        if (Array.isArray(message.content)) {
          const contentParts = message.content.map((part) => {
            if (part.type === 'image_url') {
              return part as ChatCompletionContentPartImage;
            }
            return part as ChatCompletionContentPartText;
          });
          return { ...message, content: contentParts } as ChatCompletionMessageParam;
        }
        return message as ChatCompletionMessageParam;
      }
    );

    const body: ChatCompletionCreateParamsNonStreaming = {
      ...openaiOptions,
      messages: formattedMessages,
      model: this.modelName,
      response_format: responseFormatPayload,
      stream: false,
      tools: options.tools?.map((tool) => ({
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
        type: "function",
      })),
    };

    const response = await this.client.chat.completions.create(body);

    effectiveLogger({
      message: "Response received from OpenAI compatible API",
      level: infoLevel, 
      auxiliary: { 
        choiceCount: { value: String(response.choices.length), type: "integer" },
        firstChoiceFinishReason: { value: String(response.choices[0]?.finish_reason), type: "string" },
        usage: { value: JSON.stringify(response.usage), type: "object" },
        requestId: { value: String(requestId), type: "string" },
        component: { value: "CustomOpenAIClientWrapper", type: "string" },
      },
    });

    if (options.response_model && options.response_model.schema) {
      const extractedData = response.choices[0]?.message?.content;
      if (extractedData == null) {
        effectiveLogger({ 
            message: "No content in response message for structured response.", 
            level: errorLevel, 
            auxiliary: { 
                component: { value: "CustomOpenAIClientWrapper", type: "string" }, 
                requestId: { value: String(requestId), type: "string" }
            }
        });
        throw new CreateChatCompletionResponseError("No content in response message for structured response.");
      }
      
      let parsedData;
      try {
        parsedData = JSON.parse(extractedData);
      } catch (e: any) {
        effectiveLogger({ 
            message: `Failed to parse JSON response: ${e.message}`, 
            level: errorLevel, 
            auxiliary: { 
                component: { value: "CustomOpenAIClientWrapper", type: "string" }, 
                originalResponse: { value: extractedData, type: "string" }, 
                requestId: { value: String(requestId), type: "string" }
            } 
        });
        if (retries > 0) {
          return this.createChatCompletion({ options, logger, retries: retries - 1 });
        }
        throw new CreateChatCompletionResponseError(`Failed to parse JSON response: ${extractedData}`);
      }

      if (!validateZodSchema(options.response_model.schema, parsedData)) {
        effectiveLogger({ 
            message: "Invalid response schema after parsing.", 
            level: errorLevel, 
            auxiliary: { 
                component: { value: "CustomOpenAIClientWrapper", type: "string" }, 
                parsedDataJSON: { value: JSON.stringify(parsedData), type: "object" }, 
                requestId: { value: String(requestId), type: "string" }
            } 
        });
        if (retries > 0) {
          return this.createChatCompletion({ options, logger, retries: retries - 1 });
        }
        throw new CreateChatCompletionResponseError("Invalid response schema");
      }
      return { data: parsedData, usage: response.usage } as T;
    }

    return { data: response.choices[0]?.message?.content, usage: response.usage } as T;
  }
}
