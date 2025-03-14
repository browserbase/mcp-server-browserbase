import { z, ZodTypeAny } from 'zod';

/**
 * Converts a JSON Schema object to a Zod schema
 * @param schema The JSON Schema object to convert
 * @returns A Zod schema equivalent to the input JSON Schema
 */
export function jsonSchemaToZod(schema: any): ZodTypeAny {
  switch (schema.type) {
    case 'object':
      if (schema.properties) {
        const shape: Record<string, ZodTypeAny> = {};
        for (const key in schema.properties) {
          shape[key] = jsonSchemaToZod(schema.properties[key]);
        }
        let zodObject = z.object(shape);
        if (schema.required && Array.isArray(schema.required)) {
          zodObject = zodObject.partial().required(schema.required);
        }
        if (schema.description) {
          zodObject = zodObject.describe(schema.description);
        }
        return zodObject;
      } else {
        return z.object({});
      }
    case 'array':
      if (schema.items) {
        let zodArray = z.array(jsonSchemaToZod(schema.items));
        if (schema.description) {
          zodArray = zodArray.describe(schema.description);
        }
        return zodArray;
      } else {
        return z.array(z.any());
      }
    case 'string':
      if (schema.enum) {
        return z.string().refine(val => schema.enum.includes(val));
      }
      let zodString = z.string();
      if (schema.description) {
        zodString = zodString.describe(schema.description);
      }
      return zodString;
    case 'number':
      let zodNumber = z.number();
      if (schema.minimum !== undefined) {
        zodNumber = zodNumber.min(schema.minimum);
      }
      if (schema.maximum !== undefined) {
        zodNumber = zodNumber.max(schema.maximum);
      }
      if (schema.description) {
        zodNumber = zodNumber.describe(schema.description);
      }
      return zodNumber;
    case 'boolean':
      let zodBoolean = z.boolean();
      if (schema.description) {
        zodBoolean = zodBoolean.describe(schema.description);
      }
      return zodBoolean;
    default:
      return z.any();
  }
}

/**
 * Sanitizes a message to ensure it's properly formatted JSON
 * @param message The message to sanitize
 * @returns A sanitized JSON string
 */
export function sanitizeMessage(message: any): string {
  try {
    // Ensure the message is properly stringified JSON
    if (typeof message === 'string') {
      JSON.parse(message); // Validate JSON structure
      return message;
    }
    return JSON.stringify(message);
  } catch (error) {
    return JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32700,
        message: 'Parse error',
      },
      id: null,
    });
  }
} 