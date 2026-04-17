---
name: api-contracts
description: "Guides REST API and interface design. Use when designing API endpoints, defining TypeScript interfaces for module boundaries, or building any system where consumers depend on a contract. Use when adding new endpoints, modifying response shapes, or defining data models that cross boundaries."
---

# API and Interface Design

Design stable interfaces with clear contracts. Define the interface before implementing. Every observable behavior becomes a de facto contract (Hyrum's Law), so design surfaces carefully.

## When to Use

- Designing new API endpoints
- Defining TypeScript interfaces for module boundaries
- Modifying existing API response shapes
- Building anything with consumers that depend on a contract
- Adding pagination, filtering, or sorting to endpoints

## Core Principles

1. **Hyrum's Law:** With enough users, every observable behavior becomes depended on — including bugs, timing, and undocumented side effects. Design surfaces deliberately.
2. **Contract-first:** Define the TypeScript interface before implementing. The interface is the spec.
3. **Validate at boundaries, trust internally:** Validate at API route handlers, form submissions, external service responses. Do NOT validate between internal functions with type contracts.
4. **Prefer addition over modification:** Adding a new field is safe. Changing a field's type or removing it breaks consumers.

## Contract-First Design

Define the interface before writing implementation:

```typescript
interface TaskAPI {
  createTask(input: CreateTaskInput): Promise<Task>;
  listTasks(params: ListTasksParams): Promise<PaginatedResult<Task>>;
  getTask(id: string): Promise<Task>;
  updateTask(id: string, input: UpdateTaskInput): Promise<Task>;
  deleteTask(id: string): Promise<void>;
}
```

**Input/output separation** — creation input and stored entity are different types:

```typescript
interface CreateTaskInput {
  title: string;
  description?: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}
```

## Error Semantics

Use a consistent error shape across all endpoints:

```typescript
interface APIError {
  error: {
    code: string;        // Machine-readable: "VALIDATION_ERROR"
    message: string;     // Human-readable
    details?: unknown;   // Additional context (validation errors, etc.)
  };
}
```

**Status code mapping:**

| Status | Meaning | When to Use |
|--------|---------|-------------|
| 400 | Bad Request | Malformed request (invalid JSON, missing required field) |
| 401 | Unauthorized | Not authenticated |
| 403 | Forbidden | Authenticated but not authorized for this resource |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate, version mismatch |
| 422 | Unprocessable | Semantically invalid input (valid JSON, wrong values) |
| 500 | Server Error | Never expose internals in the response |

## Validation at Boundaries

```typescript
import { z } from 'zod';

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

app.post('/api/tasks', async (req, res) => {
  const result = CreateTaskSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid task data',
        details: result.error.flatten(),
      },
    });
  }
  // After validation, internal code trusts types
  const task = await taskService.create(result.data);
  return res.status(201).json(task);
});
```

**Validate at:** API route handlers, form submission handlers, external service responses, environment variables.
**Do NOT validate:** Between internal functions with type contracts, in utility functions, on own database data.

## REST Resource Design

```
GET    /api/tasks              → List (with query params for filtering)
POST   /api/tasks              → Create
GET    /api/tasks/:id          → Get single
PATCH  /api/tasks/:id          → Update (partial)
DELETE /api/tasks/:id          → Delete
GET    /api/tasks/:id/comments → Sub-resource list
POST   /api/tasks/:id/comments → Sub-resource create
```

## Naming Conventions

| Pattern | Convention | Example |
|---------|-----------|---------|
| REST endpoints | Plural nouns, no verbs | `GET /api/tasks`, `POST /api/tasks` |
| Query params | camelCase | `?sortBy=createdAt&pageSize=20` |
| Response fields | camelCase | `{ createdAt, updatedAt, taskId }` |
| Boolean fields | is/has/can prefix | `isComplete`, `hasAttachments` |
| Enum values | UPPER_SNAKE | `"IN_PROGRESS"`, `"COMPLETED"` |

## Pagination

Every list endpoint must be paginated:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 142,
    "totalPages": 8
  }
}
```

## Type Safety Patterns

**Branded types for IDs** — prevent mixing TaskId and UserId:

```typescript
type TaskId = string & { readonly __brand: 'TaskId' };
type UserId = string & { readonly __brand: 'UserId' };
```

**Discriminated unions for variants:**

```typescript
type TaskStatus =
  | { type: 'pending' }
  | { type: 'in_progress'; assignee: string; startedAt: Date }
  | { type: 'completed'; completedAt: Date; completedBy: string }
  | { type: 'cancelled'; reason: string; cancelledAt: Date };
```

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "We'll document the API later" | Types ARE the documentation. Define the contract first. |
| "We don't need pagination for now" | You will at 100+ items. Add it from the start. |
| "PATCH is complicated, let's use PUT" | PUT requires the full object. PATCH is what clients actually want for partial updates. |
| "Nobody uses that undocumented behavior" | Hyrum's Law: if it's observable, somebody depends on it. |
| "We'll version the API when needed" | Breaking changes without versioning break consumers silently. |

## Red Flags

- Endpoints returning different shapes based on conditions
- Inconsistent error formats across endpoints
- Validation scattered throughout internal code instead of at boundaries
- Breaking changes to existing fields (type changes, removals)
- List endpoints without pagination
- Verbs in REST URLs (`/api/createTask` instead of `POST /api/tasks`)
- Third-party API responses used without validation

## Verification

After implementing API changes:

- [ ] Interface/contract defined before implementation
- [ ] All endpoints return consistent error shapes
- [ ] Input validated at the boundary with schema validation
- [ ] List endpoints paginated
- [ ] No breaking changes to existing response fields
- [ ] Naming follows project conventions

## Performance Notes
<!-- Updated by /retro. Do not edit manually. -->
<!-- Format: - YYYY-MM-DD [project]: observation (evidence: source) -->
