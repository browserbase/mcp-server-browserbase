// Local development entry point - loads environment variables
import * as dotenv from "dotenv";
dotenv.config();

// Re-export everything from index
export { default, configSchema } from "./index.js";
