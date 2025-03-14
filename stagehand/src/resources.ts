/**
 * Resources module for the Stagehand MCP server
 * Contains resources definitions and handlers for resource-related requests
 */

// Define task status enums
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// Task data structure
export interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  result?: any;
  error?: string;
  progress?: number;
}

// In-memory task storage
const tasks: Map<string, Task> = new Map();

// Define the resources
export const RESOURCES = [
  {
    name: "tasks",
    description: "Access the status of long-running tasks",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier for the task" },
        name: { type: "string", description: "Name of the tool or operation being executed" },
        status: { 
          type: "string", 
          enum: Object.values(TaskStatus),
          description: "Current status of the task" 
        },
        createdAt: { type: "string", description: "ISO timestamp when the task was created" },
        updatedAt: { type: "string", description: "ISO timestamp when the task was last updated" },
        result: { type: "object", description: "Result data if the task is completed" },
        error: { type: "string", description: "Error message if the task failed" },
        progress: { type: "number", description: "Progress percentage (0-100) if available" }
      },
      required: ["id", "name", "status", "createdAt", "updatedAt"]
    },
    actions: ["read", "list"]
  }
];

// Define the resource templates
export const RESOURCE_TEMPLATES = [];

/**
 * Handle listing resources request
 * @returns Resources list response
 */
export function listResources() {
  return { resources: RESOURCES };
}

/**
 * Handle listing resource templates request
 * @returns An empty resource templates list response
 */
export function listResourceTemplates() {
  return { resourceTemplates: [] };
}

/**
 * Create a new task
 * @param name Name of the task/tool being executed
 * @returns The created task
 */
export function createTask(name: string): Task {
  const id = generateTaskId();
  const now = new Date().toISOString();
  
  const task: Task = {
    id,
    name,
    status: TaskStatus.PENDING,
    createdAt: now,
    updatedAt: now
  };
  
  tasks.set(id, task);
  return task;
}

/**
 * Get a task by ID
 * @param id Task ID
 * @returns The task or undefined if not found
 */
export function getTask(id: string): Task | undefined {
  return tasks.get(id);
}

/**
 * List all tasks
 * @returns Array of all tasks
 */
export function getAllTasks(): Task[] {
  return Array.from(tasks.values());
}

/**
 * Update a task's status and details
 * @param id Task ID
 * @param updates Task property updates
 * @returns The updated task or undefined if task not found
 */
export function updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Task | undefined {
  const task = tasks.get(id);
  if (!task) return undefined;
  
  const updatedTask = {
    ...task,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  tasks.set(id, updatedTask);
  return updatedTask;
}

/**
 * Mark a task as completed with result
 * @param id Task ID
 * @param result Task result data
 * @returns The updated task or undefined if task not found
 */
export function completeTask(id: string, result: any): Task | undefined {
  return updateTask(id, {
    status: TaskStatus.COMPLETED,
    result
  });
}

/**
 * Mark a task as failed with error
 * @param id Task ID
 * @param error Error message
 * @returns The updated task or undefined if task not found
 */
export function failTask(id: string, error: string): Task | undefined {
  return updateTask(id, {
    status: TaskStatus.FAILED,
    error
  });
}

/**
 * Generate a unique task ID
 * @returns Unique ID string
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Handle get resource request for tasks
 * @param id Resource ID (task ID)
 * @returns The requested task or error
 */
export function getResource(id: string) {
  if (!id.startsWith('tasks/')) {
    return { error: { code: -32603, message: "Invalid resource ID format" } };
  }
  
  const taskId = id.substring('tasks/'.length);
  const task = getTask(taskId);
  
  if (!task) {
    return { error: { code: -32603, message: `Task with ID ${taskId} not found` } };
  }
  
  return { resource: task };
}

/**
 * Handle list resources for a specific resource type
 * @param resourceType Type of resource to list
 * @returns List of requested resources
 */
export function listResourcesOfType(resourceType: string) {
  if (resourceType === 'tasks') {
    return { resources: getAllTasks() };
  }
  
  return { resources: [] };
} 