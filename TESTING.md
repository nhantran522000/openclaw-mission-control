# OpenClaw Mission Control - Testing Checklist

This document provides a comprehensive testing checklist for validating the OpenClaw Mission Control application deployment and functionality.

## Table of Contents

1. [Database Migration Testing](#1-database-migration-testing)
2. [Authentication Testing](#2-authentication-testing)
3. [Task CRUD Testing](#3-task-crud-testing)
4. [Task Action Testing](#4-task-action-testing)
5. [Admin Panel Testing](#5-admin-panel-testing)
6. [Frontend Testing](#6-frontend-testing)
7. [Integration Testing](#7-integration-testing)
8. [Performance Testing](#8-performance-testing)

---

## 1. Database Migration Testing

Test the database setup and migration process.

### Prerequisites
- [ ] Docker and Docker Compose are installed
- [ ] `.env.production` file is configured with correct `DATABASE_URL`
- [ ] No existing containers running on the same ports

### Migration Steps

- [ ] **Start Docker services**
  ```bash
  docker-compose up -d
  ```
  Verify: All three containers (mission-control, postgres, caddy) are running
  ```bash
  docker-compose ps
  ```

- [ ] **Run Prisma migrations**
  ```bash
  npx prisma migrate deploy
  ```
  Verify: All migrations applied successfully, no errors in output

- [ ] **Seed the database**
  ```bash
  npx prisma db seed
  ```
  Verify: Seed script completes without errors

- [ ] **Verify agents created in database**
  ```bash
  docker-compose exec postgres psql -U nhan -d openclaw_mission_control -c "SELECT id, name, role FROM agents;"
  ```
  Verify: Agent records exist with expected data

- [ ] **Check data integrity**
  ```bash
  # Verify table structure
  docker-compose exec postgres psql -U nhan -d openclaw_mission_control -c "\dt"
  
  # Check foreign key relationships
  docker-compose exec postgres psql -U nhan -d openclaw_mission_control -c "SELECT count(*) FROM tasks;"
  docker-compose exec postgres psql -U nhan -d openclaw_mission_control -c "SELECT count(*) FROM comments;"
  ```

### Rollback Testing (Optional)

- [ ] **Test migration rollback**
  ```bash
  npx prisma migrate resolve --rolled-back <migration_name>
  ```

---

## 2. Authentication Testing

Test the API key authentication system.

### Test Setup
```bash
# Set up test variables
API_URL="https://vogalingo.win/api"
VALID_API_KEY="<your-valid-api-key>"
INVALID_API_KEY="invalid-key-12345"
```

### Authentication Tests

- [ ] **Access API without API key → 401 Unauthorized**
  ```bash
  curl -s -o /dev/null -w "%{http_code}" $API_URL/tasks
  ```
  Expected: `401`
  
  Full response test:
  ```bash
  curl -s $API_URL/tasks
  ```
  Expected: `{"error": "Unauthorized"}` or similar error message

- [ ] **Access API with invalid API key → 401 Unauthorized**
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $INVALID_API_KEY" \
    $API_URL/tasks
  ```
  Expected: `401`

- [ ] **Access API with valid API key → 200 OK**
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $VALID_API_KEY" \
    $API_URL/tasks
  ```
  Expected: `200`

- [ ] **Test API key format validation**
  ```bash
  # Test with malformed key (missing Bearer prefix)
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: $VALID_API_KEY" \
    $API_URL/tasks
  ```
  Expected: `401`

  ```bash
  # Test with empty key
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer " \
    $API_URL/tasks
  ```
  Expected: `401`

- [ ] **Test agent ID extraction**
  ```bash
  # Verify the API correctly identifies the agent from the API key
  curl -s -H "Authorization: Bearer $VALID_API_KEY" \
    $API_URL/agents/me
  ```
  Expected: JSON response with agent details matching the API key's owner

### Admin Authentication Tests

- [ ] **Access admin panel without ADMIN_API_KEY → 401**
  ```bash
  curl -s -o /dev/null -w "%{http_code}" $API_URL/admin/agents
  ```
  Expected: `401`

- [ ] **Access admin panel with valid ADMIN_API_KEY → 200**
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    -H "x-admin-key: $ADMIN_API_KEY" \
    $API_URL/admin/agents
  ```
  Expected: `200`

---

## 3. Task CRUD Testing

Test Create, Read, Update, Delete operations for tasks.

### Test Setup
```bash
API_URL="https://vogalingo.win/api"
API_KEY="<your-valid-api-key>"

# Create a test task for subsequent tests
TEST_TASK=$(curl -s -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Task","description":"Test description","priority":"medium"}' \
  $API_URL/tasks)
TEST_TASK_ID=$(echo $TEST_TASK | jq -r '.id')
```

### Create Task

- [ ] **Create task (POST /api/tasks)**
  ```bash
  curl -s -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "title": "Test Task",
      "description": "This is a test task",
      "priority": "high",
      "deliverables": ["Deliverable 1", "Deliverable 2"]
    }' \
    $API_URL/tasks | jq
  ```
  Expected: JSON response with created task including `id`, `title`, `status: "backlog"`

- [ ] **Verify task appears in database**
  ```bash
  docker-compose exec postgres psql -U nhan -d openclaw_mission_control \
    -c "SELECT * FROM tasks WHERE title = 'Test Task';"
  ```

### List Tasks

- [ ] **List all tasks (GET /api/tasks)**
  ```bash
  curl -s -H "Authorization: Bearer $API_KEY" \
    $API_URL/tasks | jq
  ```
  Expected: JSON array of tasks

- [ ] **List tasks with status filter**
  ```bash
  curl -s -H "Authorization: Bearer $API_KEY" \
    "$API_URL/tasks?status=in_progress" | jq
  ```
  Expected: JSON array containing only tasks with `status: "in_progress"`

- [ ] **List tasks with priority filter**
  ```bash
  curl -s -H "Authorization: Bearer $API_KEY" \
    "$API_URL/tasks?priority=high" | jq
  ```
  Expected: JSON array containing only high priority tasks

### Get Single Task

- [ ] **Get single task (GET /api/tasks/[id])**
  ```bash
  curl -s -H "Authorization: Bearer $API_KEY" \
    $API_URL/tasks/$TEST_TASK_ID | jq
  ```
  Expected: JSON object with full task details

- [ ] **Get non-existent task → 404**
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $API_KEY" \
    $API_URL/tasks/non-existent-id
  ```
  Expected: `404`

### Update Task

- [ ] **Update task (PATCH /api/tasks/[id])**
  ```bash
  curl -s -X PATCH \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"title": "Updated Task Title", "priority": "low"}' \
    $API_URL/tasks/$TEST_TASK_ID | jq
  ```
  Expected: JSON response with updated task

- [ ] **Verify update persisted**
  ```bash
  curl -s -H "Authorization: Bearer $API_KEY" \
    $API_URL/tasks/$TEST_TASK_ID | jq '.title, .priority'
  ```
  Expected: `"Updated Task Title"`, `"low"`

### Delete Task

- [ ] **Delete task (DELETE /api/tasks/[id])**
  ```bash
  curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $API_KEY" \
    $API_URL/tasks/$TEST_TASK_ID
  ```
  Expected: `200` or `204`

- [ ] **Verify task deleted**
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $API_KEY" \
    $API_URL/tasks/$TEST_TASK_ID
  ```
  Expected: `404`

---

## 4. Task Action Testing

Test task-specific actions and state transitions.

### Test Setup
```bash
# Create a new task for action tests
TEST_TASK=$(curl -s -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Action Test Task","description":"For testing actions"}' \
  $API_URL/tasks)
TEST_TASK_ID=$(echo $TEST_TASK | jq -r '.id')
```

### Pick Up Task

- [ ] **Pick up task (POST /api/tasks/[id]/pick)**
  ```bash
  curl -s -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    $API_URL/tasks/$TEST_TASK_ID/pick | jq
  ```
  Expected: JSON response with task `status: "in_progress"` and `pickedUpBy` set to agent ID

- [ ] **Verify task status changed**
  ```bash
  curl -s -H "Authorization: Bearer $API_KEY" \
    $API_URL/tasks/$TEST_TASK_ID | jq '.status'
  ```
  Expected: `"in_progress"`

- [ ] **Cannot pick up already picked task**
  ```bash
  curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $API_KEY" \
    $API_URL/tasks/$TEST_TASK_ID/pick
  ```
  Expected: `400` or appropriate error

### Log Progress

- [ ] **Log progress (POST /api/tasks/[id]/log)**
  ```bash
  curl -s -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"message": "Made progress on the task", "progress": 50}' \
    $API_URL/tasks/$TEST_TASK_ID/log | jq
  ```
  Expected: JSON response confirming the log entry

- [ ] **Verify log entry created**
  ```bash
  curl -s -H "Authorization: Bearer $API_KEY" \
    $API_URL/tasks/$TEST_TASK_ID | jq '.logs'
  ```
  Expected: Array containing the log entry

### Complete Task

- [ ] **Complete task (POST /api/tasks/[id]/complete)**
  ```bash
  curl -s -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"summary": "Task completed successfully"}' \
    $API_URL/tasks/$TEST_TASK_ID/complete | jq
  ```
  Expected: JSON response with task `status: "done"`

- [ ] **Verify task marked complete**
  ```bash
  curl -s -H "Authorization: Bearer $API_KEY" \
    $API_URL/tasks/$TEST_TASK_ID | jq '.status'
  ```
  Expected: `"done"`

### Add Comment

- [ ] **Add comment (POST /api/tasks/[id]/comments)**
  ```bash
  # Create another task for comment testing
  COMMENT_TASK=$(curl -s -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"title":"Comment Test Task"}' \
    $API_URL/tasks)
  COMMENT_TASK_ID=$(echo $COMMENT_TASK | jq -r '.id')

  # Add comment
  curl -s -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"content": "This is a test comment"}' \
    $API_URL/tasks/$COMMENT_TASK_ID/comments | jq
  ```
  Expected: JSON response with created comment

- [ ] **Verify comment appears in task**
  ```bash
  curl -s -H "Authorization: Bearer $API_KEY" \
    $API_URL/tasks/$COMMENT_TASK_ID | jq '.comments'
  ```
  Expected: Array containing the comment

---

## 5. Admin Panel Testing

Test the administrative functions.

### Test Setup
```bash
ADMIN_API_KEY="<your-admin-api-key>"
API_URL="https://vogalingo.win/api/admin"
```

### Access and Authentication

- [ ] **Access admin panel with ADMIN_API_KEY**
  ```bash
  curl -s -H "x-admin-key: $ADMIN_API_KEY" \
    $API_URL/agents | jq
  ```
  Expected: JSON array of all agents

- [ ] **Access admin panel without valid key → 401**
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    $API_URL/agents
  ```
  Expected: `401`

### Agent Management

- [ ] **View all agents**
  ```bash
  curl -s -H "x-admin-key: $ADMIN_API_KEY" \
    $API_URL/agents | jq
  ```
  Expected: JSON array with all agent records

- [ ] **Create new agent**
  ```bash
  curl -s -X POST \
    -H "x-admin-key: $ADMIN_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test Agent",
      "role": "Developer",
      "description": "Agent for testing"
    }' \
    $API_URL/agents | jq
  ```
  Expected: JSON response with new agent including generated `apiKey`

- [ ] **Regenerate API key**
  ```bash
  # First, get an agent ID
  AGENT_ID=$(curl -s -H "x-admin-key: $ADMIN_API_KEY" \
    $API_URL/agents | jq -r '.[0].id')

  # Regenerate key
  curl -s -X POST \
    -H "x-admin-key: $ADMIN_API_KEY" \
    $API_URL/agents/$AGENT_ID/regenerate-key | jq
  ```
  Expected: JSON response with new `apiKey`

- [ ] **Deactivate agent**
  ```bash
  curl -s -X PATCH \
    -H "x-admin-key: $ADMIN_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"isActive": false}' \
    $API_URL/agents/$AGENT_ID | jq
  ```
  Expected: JSON response with `isActive: false`

- [ ] **Activate agent**
  ```bash
  curl -s -X PATCH \
    -H "x-admin-key: $ADMIN_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"isActive": true}' \
    $API_URL/agents/$AGENT_ID | jq
  ```
  Expected: JSON response with `isActive: true`

- [ ] **Verify deactivated agent cannot authenticate**
  ```bash
  # Deactivate agent first
  curl -s -X PATCH \
    -H "x-admin-key: $ADMIN_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"isActive": false}' \
    $API_URL/agents/$AGENT_ID

  # Try to use the agent's API key
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $AGENT_API_KEY" \
    https://vogalingo.win/api/tasks
  ```
  Expected: `401` (agent should not be able to authenticate when deactivated)

---

## 6. Frontend Testing

Test the web user interface.

### Prerequisites
- Browser (Chrome, Firefox, Safari, or Edge)
- Access to https://vogalingo.win
- Valid login credentials or API key

### Login Page

- [ ] **Login page loads**
  - Navigate to https://vogalingo.win/login
  - Verify: Login form is displayed with username/password fields

- [ ] **Login with valid credentials**
  - Enter valid credentials
  - Click "Login" button
  - Verify: Redirected to main dashboard/kanban board

- [ ] **Login with invalid credentials**
  - Enter invalid credentials
  - Click "Login" button
  - Verify: Error message displayed, user remains on login page

- [ ] **Login form validation**
  - Submit empty form
  - Verify: Validation errors displayed for required fields

### Kanban Board

- [ ] **Kanban board displays**
  - Navigate to https://vogalingo.win (after login)
  - Verify: Kanban board with columns (Backlog, In Progress, Review, Done)

- [ ] **Tasks display in correct columns**
  - Verify: Tasks appear in columns based on their status
  - Verify: Task cards show title, priority, and assignee

- [ ] **Task filtering works**
  - Use filter bar to filter by priority
  - Verify: Only matching tasks displayed

### Task Creation

- [ ] **Task creation form opens**
  - Click "New Task" or "+" button
  - Verify: Task creation form/modal appears

- [ ] **Task creation works**
  - Fill in task details (title, description, priority)
  - Click "Create" or "Save"
  - Verify: Task appears in Backlog column

- [ ] **Task creation validation**
  - Submit form without required fields
  - Verify: Validation errors displayed

### Task Updates

- [ ] **Task detail view opens**
  - Click on a task card
  - Verify: Task detail panel/modal opens with full information

- [ ] **Task updates reflect in UI**
  - Edit task (change title, priority, etc.)
  - Save changes
  - Verify: Changes reflected immediately in the UI

- [ ] **Task status change via drag-and-drop** (if applicable)
  - Drag task to different column
  - Verify: Task status updated and persists on refresh

### Team Status

- [ ] **Team status page loads**
  - Navigate to https://vogalingo.win/team
  - Verify: Team members displayed with their status

- [ ] **Agent activity visible**
  - Verify: Current tasks for each agent displayed
  - Verify: Activity indicators are accurate

---

## 7. Integration Testing

Test end-to-end workflows and integrations.

### Complete Task Workflow

- [ ] **End-to-end task lifecycle**
  1. Create a new task via API
  2. Verify task appears in frontend
  3. Pick up task (change status to in_progress)
  4. Add progress log
  5. Add comment
  6. Complete task
  7. Verify final state in both API and frontend

### Multi-Agent Workflow

- [ ] **Task assignment between agents**
  1. Create task as Agent A
  2. Pick up task as Agent B
  3. Add comment as Agent A
  4. Verify both agents can see updates

### Notification System (if applicable)

- [ ] **Mentions work correctly**
  ```bash
  curl -s -X POST \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"content": "@agent-name please review"}' \
    $API_URL/tasks/$TASK_ID/comments
  ```
  Verify: Mention is created and visible

- [ ] **Mark mentions as read**
  ```bash
  curl -s -X POST \
    -H "Authorization: Bearer $API_KEY" \
    https://vogalingo.win/api/mentions/read
  ```

---

## 8. Performance Testing

Test application performance under load.

### Response Time Tests

- [ ] **API response time under normal load**
  ```bash
  # Test multiple endpoints
  for i in {1..10}; do
    curl -s -o /dev/null -w "%{time_total}\n" \
      -H "Authorization: Bearer $API_KEY" \
      $API_URL/tasks
  done
  ```
  Expected: Average response time < 500ms

- [ ] **Database query performance**
  ```bash
  docker-compose exec postgres psql -U nhan -d openclaw_mission_control \
    -c "EXPLAIN ANALYZE SELECT * FROM tasks WHERE status = 'in_progress';"
  ```
  Expected: Query time < 100ms

### Load Testing (Optional)

- [ ] **Concurrent requests test**
  ```bash
  # Using ab (Apache Benchmark)
  ab -n 100 -c 10 \
    -H "Authorization: Bearer $API_KEY" \
    https://vogalingo.win/api/tasks
  ```
  Expected: No failed requests, reasonable response times

---

## Test Summary Template

After completing all tests, fill out this summary:

```
## Test Summary

**Date:** YYYY-MM-DD
**Tester:** Name
**Environment:** Production / Staging

### Results

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Database Migration | X / 5 | | |
| Authentication | X / 7 | | |
| Task CRUD | X / 8 | | |
| Task Actions | X / 8 | | |
| Admin Panel | X / 8 | | |
| Frontend | X / 15 | | |
| Integration | X / 5 | | |
| Performance | X / 3 | | |

### Issues Found

1. [Description of issue 1]
2. [Description of issue 2]

### Notes

[Any additional notes or observations]
```

---

## Quick Test Script

Save this script for quick validation:

```bash
#!/bin/bash
# quick-test.sh - Quick validation script

API_URL="https://vogalingo.win/api"
API_KEY="${1:-$VALID_API_KEY}"

echo "🔍 Running quick tests..."

# Test 1: Health check
echo -n "Health check: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $API_URL/tasks)
[ "$STATUS" == "401" ] && echo "✅ Pass" || echo "❌ Fail (expected 401, got $STATUS)"

# Test 2: Authenticated request
echo -n "Authenticated request: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $API_KEY" $API_URL/tasks)
[ "$STATUS" == "200" ] && echo "✅ Pass" || echo "❌ Fail (expected 200, got $STATUS)"

# Test 3: Create task
echo -n "Create task: "
RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d '{"title":"Quick Test Task"}' $API_URL/tasks)
TASK_ID=$(echo $RESPONSE | jq -r '.id // empty')
[ -n "$TASK_ID" ] && echo "✅ Pass (ID: $TASK_ID)" || echo "❌ Fail"

# Test 4: Delete task
if [ -n "$TASK_ID" ]; then
  echo -n "Delete task: "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer $API_KEY" $API_URL/tasks/$TASK_ID)
  [ "$STATUS" == "200" ] && echo "✅ Pass" || echo "❌ Fail (expected 200, got $STATUS)"
fi

echo "✨ Quick test complete!"
```

Usage:
```bash
chmod +x quick-test.sh
./quick-test.sh your-api-key-here
```
