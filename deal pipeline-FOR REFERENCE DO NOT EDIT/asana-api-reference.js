/**
 * Asana API Reference
 * 
 * This file contains all Asana API endpoints organized by resource type.
 * Based on: https://developers.asana.com/reference/rest-api-reference
 * 
 * Base URL: https://app.asana.com/api/1.0
 * 
 * Authentication:
 * - Personal Access Token (PAT): Set in Authorization header as "Bearer {token}"
 * - OAuth 2.0: For production apps, use OAuth flow
 * 
 * Rate Limits:
 * - 150 requests per minute per user
 * - Use exponential backoff for rate limit errors (429)
 * 
 * Notes for Writeback Functionality:
 * - POST endpoints can be used to create resources
 * - PUT endpoints can be used to update resources
 * - DELETE endpoints can be used to remove resources
 * - All write operations require appropriate permissions
 */

const ASANA_API_BASE = 'https://app.asana.com/api/1.0';

/**
 * API Endpoints organized by resource type
 */
const AsanaAPI = {
    // ============================================
    // ALLOCATIONS
    // ============================================
    allocations: {
        /**
         * Get an allocation
         * GET /allocations/{allocation_gid}
         */
        get: (allocationGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/allocations/${allocationGid}`,
            ...options
        }),

        /**
         * Update an allocation
         * PUT /allocations/{allocation_gid}
         * Note: For writeback - update allocation details
         */
        update: (allocationGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/allocations/${allocationGid}`,
            body: data,
            ...options
        }),

        /**
         * Delete an allocation
         * DELETE /allocations/{allocation_gid}
         */
        delete: (allocationGid, options = {}) => ({
            method: 'DELETE',
            url: `${ASANA_API_BASE}/allocations/${allocationGid}`,
            ...options
        }),

        /**
         * Get multiple allocations
         * GET /allocations
         */
        list: (options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/allocations`,
            ...options
        }),

        /**
         * Create an allocation
         * POST /allocations
         * Note: For writeback - create new allocation
         */
        create: (data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/allocations`,
            body: data,
            ...options
        })
    },

    // ============================================
    // ATTACHMENTS
    // ============================================
    attachments: {
        /**
         * Get an attachment
         * GET /attachments/{attachment_gid}
         */
        get: (attachmentGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/attachments/${attachmentGid}`,
            ...options
        }),

        /**
         * Delete an attachment
         * DELETE /attachments/{attachment_gid}
         */
        delete: (attachmentGid, options = {}) => ({
            method: 'DELETE',
            url: `${ASANA_API_BASE}/attachments/${attachmentGid}`,
            ...options
        }),

        /**
         * Get attachments from an object
         * GET /attachments?parent={parent_gid}
         */
        list: (parentGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/attachments`,
            params: { parent: parentGid },
            ...options
        }),

        /**
         * Upload an attachment
         * POST /attachments
         * Note: For writeback - upload files to tasks/projects
         */
        upload: (data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/attachments`,
            body: data,
            ...options
        })
    },

    // ============================================
    // CUSTOM FIELDS
    // ============================================
    customFields: {
        /**
         * Create a custom field
         * POST /custom_fields
         * Note: For writeback - create new custom fields
         */
        create: (data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/custom_fields`,
            body: data,
            ...options
        }),

        /**
         * Get a custom field
         * GET /custom_fields/{custom_field_gid}
         */
        get: (customFieldGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/custom_fields/${customFieldGid}`,
            ...options
        }),

        /**
         * Update a custom field
         * PUT /custom_fields/{custom_field_gid}
         * Note: For writeback - update custom field properties
         */
        update: (customFieldGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/custom_fields/${customFieldGid}`,
            body: data,
            ...options
        }),

        /**
         * Delete a custom field
         * DELETE /custom_fields/{custom_field_gid}
         */
        delete: (customFieldGid, options = {}) => ({
            method: 'DELETE',
            url: `${ASANA_API_BASE}/custom_fields/${customFieldGid}`,
            ...options
        }),

        /**
         * Get a workspace's custom fields
         * GET /workspaces/{workspace_gid}/custom_fields
         */
        listByWorkspace: (workspaceGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}/custom_fields`,
            ...options
        }),

        /**
         * Create an enum option
         * POST /custom_fields/{custom_field_gid}/enum_options
         * Note: For writeback - add options to enum custom fields
         */
        createEnumOption: (customFieldGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/custom_fields/${customFieldGid}/enum_options`,
            body: data,
            ...options
        }),

        /**
         * Reorder a custom field's enum
         * POST /custom_fields/{custom_field_gid}/enum_options/insert
         * Note: For writeback - reorder enum options
         */
        reorderEnum: (customFieldGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/custom_fields/${customFieldGid}/enum_options/insert`,
            body: data,
            ...options
        }),

        /**
         * Update an enum option
         * PUT /custom_fields/{custom_field_gid}/enum_options/{enum_option_gid}
         * Note: For writeback - update enum option values
         */
        updateEnumOption: (customFieldGid, enumOptionGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/custom_fields/${customFieldGid}/enum_options/${enumOptionGid}`,
            body: data,
            ...options
        })
    },

    // ============================================
    // CUSTOM FIELD SETTINGS
    // ============================================
    customFieldSettings: {
        /**
         * Get a project's custom fields
         * GET /projects/{project_gid}/custom_field_settings
         */
        getByProject: (projectGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/projects/${projectGid}/custom_field_settings`,
            ...options
        }),

        /**
         * Get a portfolio's custom fields
         * GET /portfolios/{portfolio_gid}/custom_field_settings
         */
        getByPortfolio: (portfolioGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/portfolios/${portfolioGid}/custom_field_settings`,
            ...options
        }),

        /**
         * Get a team's custom fields
         * GET /teams/{team_gid}/custom_field_settings
         */
        getByTeam: (teamGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/teams/${teamGid}/custom_field_settings`,
            ...options
        }),

        /**
         * Get a goal's custom fields
         * GET /goals/{goal_gid}/custom_field_settings
         */
        getByGoal: (goalGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/goals/${goalGid}/custom_field_settings`,
            ...options
        })
    },

    // ============================================
    // GOALS
    // ============================================
    goals: {
        /**
         * Get a goal
         * GET /goals/{goal_gid}
         */
        get: (goalGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/goals/${goalGid}`,
            ...options
        }),

        /**
         * Update a goal
         * PUT /goals/{goal_gid}
         * Note: For writeback - update goal details
         */
        update: (goalGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/goals/${goalGid}`,
            body: data,
            ...options
        }),

        /**
         * Delete a goal
         * DELETE /goals/{goal_gid}
         */
        delete: (goalGid, options = {}) => ({
            method: 'DELETE',
            url: `${ASANA_API_BASE}/goals/${goalGid}`,
            ...options
        }),

        /**
         * Get goals
         * GET /goals
         */
        list: (options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/goals`,
            ...options
        }),

        /**
         * Create a goal
         * POST /goals
         * Note: For writeback - create new goals
         */
        create: (data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/goals`,
            body: data,
            ...options
        }),

        /**
         * Create a goal metric
         * POST /goals/{goal_gid}/setMetric
         * Note: For writeback - add metrics to goals
         */
        createMetric: (goalGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/goals/${goalGid}/setMetric`,
            body: data,
            ...options
        }),

        /**
         * Update a goal metric
         * POST /goals/{goal_gid}/setMetricCurrentValue
         * Note: For writeback - update metric values
         */
        updateMetric: (goalGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/goals/${goalGid}/setMetricCurrentValue`,
            body: data,
            ...options
        }),

        /**
         * Add a collaborator to a goal
         * POST /goals/{goal_gid}/addFollowers
         * Note: For writeback - add followers/collaborators
         */
        addCollaborator: (goalGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/goals/${goalGid}/addFollowers`,
            body: data,
            ...options
        }),

        /**
         * Remove a collaborator from a goal
         * POST /goals/{goal_gid}/removeFollowers
         * Note: For writeback - remove followers
         */
        removeCollaborator: (goalGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/goals/${goalGid}/removeFollowers`,
            body: data,
            ...options
        }),

        /**
         * Get parent goals from a goal
         * GET /goals/{goal_gid}/parentGoals
         */
        getParentGoals: (goalGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/goals/${goalGid}/parentGoals`,
            ...options
        }),

        /**
         * Add a custom field to a goal
         * POST /goals/{goal_gid}/addCustomFieldSetting
         * Note: For writeback - associate custom fields with goals
         */
        addCustomField: (goalGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/goals/${goalGid}/addCustomFieldSetting`,
            body: data,
            ...options
        }),

        /**
         * Remove a custom field from a goal
         * POST /goals/{goal_gid}/removeCustomFieldSetting
         * Note: For writeback - remove custom field associations
         */
        removeCustomField: (goalGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/goals/${goalGid}/removeCustomFieldSetting`,
            body: data,
            ...options
        })
    },

    // ============================================
    // PROJECTS
    // ============================================
    projects: {
        /**
         * Get multiple projects
         * GET /projects
         */
        list: (options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/projects`,
            ...options
        }),

        /**
         * Create a project
         * POST /projects
         * Note: For writeback - create new projects
         */
        create: (data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/projects`,
            body: data,
            ...options
        }),

        /**
         * Get a project
         * GET /projects/{project_gid}
         */
        get: (projectGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/projects/${projectGid}`,
            ...options
        }),

        /**
         * Update a project
         * PUT /projects/{project_gid}
         * Note: For writeback - update project details (name, notes, status, etc.)
         */
        update: (projectGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/projects/${projectGid}`,
            body: data,
            ...options
        }),

        /**
         * Delete a project
         * DELETE /projects/{project_gid}
         */
        delete: (projectGid, options = {}) => ({
            method: 'DELETE',
            url: `${ASANA_API_BASE}/projects/${projectGid}`,
            ...options
        }),

        /**
         * Duplicate a project
         * POST /projects/{project_gid}/duplicate
         * Note: For writeback - clone projects
         */
        duplicate: (projectGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/projects/${projectGid}/duplicate`,
            body: data,
            ...options
        }),

        /**
         * Get projects a task is in
         * GET /tasks/{task_gid}/projects
         */
        getByTask: (taskGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/projects`,
            ...options
        }),

        /**
         * Get a team's projects
         * GET /teams/{team_gid}/projects
         */
        getByTeam: (teamGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/teams/${teamGid}/projects`,
            ...options
        }),

        /**
         * Create a project in a team
         * POST /teams/{team_gid}/projects
         * Note: For writeback - create projects within teams
         */
        createInTeam: (teamGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/teams/${teamGid}/projects`,
            body: data,
            ...options
        }),

        /**
         * Get all projects in a workspace
         * GET /workspaces/{workspace_gid}/projects
         */
        getByWorkspace: (workspaceGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}/projects`,
            ...options
        }),

        /**
         * Create a project in a workspace
         * POST /workspaces/{workspace_gid}/projects
         * Note: For writeback - create projects in workspaces
         */
        createInWorkspace: (workspaceGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}/projects`,
            body: data,
            ...options
        }),

        /**
         * Add a custom field to a project
         * POST /projects/{project_gid}/addCustomFieldSetting
         * Note: For writeback - associate custom fields with projects
         */
        addCustomField: (projectGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/projects/${projectGid}/addCustomFieldSetting`,
            body: data,
            ...options
        }),

        /**
         * Remove a custom field from a project
         * POST /projects/{project_gid}/removeCustomFieldSetting
         * Note: For writeback - remove custom field associations
         */
        removeCustomField: (projectGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/projects/${projectGid}/removeCustomFieldSetting`,
            body: data,
            ...options
        }),

        /**
         * Get task count of a project
         * GET /projects/{project_gid}/task_count
         */
        getTaskCount: (projectGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/projects/${projectGid}/task_count`,
            ...options
        }),

        /**
         * Add users to a project
         * POST /projects/{project_gid}/addMembers
         * Note: For writeback - add team members to projects
         */
        addMembers: (projectGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/projects/${projectGid}/addMembers`,
            body: data,
            ...options
        }),

        /**
         * Remove users from a project
         * POST /projects/{project_gid}/removeMembers
         * Note: For writeback - remove team members from projects
         */
        removeMembers: (projectGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/projects/${projectGid}/removeMembers`,
            body: data,
            ...options
        }),

        /**
         * Add followers to a project
         * POST /projects/{project_gid}/addFollowers
         * Note: For writeback - add followers to projects
         */
        addFollowers: (projectGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/projects/${projectGid}/addFollowers`,
            body: data,
            ...options
        }),

        /**
         * Remove followers from a project
         * POST /projects/{project_gid}/removeFollowers
         * Note: For writeback - remove followers
         */
        removeFollowers: (projectGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/projects/${projectGid}/removeFollowers`,
            body: data,
            ...options
        }),

        /**
         * Create a project template from a project
         * POST /projects/{project_gid}/saveAsTemplate
         * Note: For writeback - save projects as templates
         */
        saveAsTemplate: (projectGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/projects/${projectGid}/saveAsTemplate`,
            body: data,
            ...options
        })
    },

    // ============================================
    // TASKS (Most important for Deal Pipeline)
    // ============================================
    tasks: {
        /**
         * Get multiple tasks
         * GET /tasks
         */
        list: (options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/tasks`,
            ...options
        }),

        /**
         * Create a task
         * POST /tasks
         * Note: For writeback - create new tasks/deals
         * Important: Can set name, notes, due_on, assignee, projects, custom_fields, etc.
         */
        create: (data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks`,
            body: data,
            ...options
        }),

        /**
         * Get a task
         * GET /tasks/{task_gid}
         */
        get: (taskGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/tasks/${taskGid}`,
            ...options
        }),

        /**
         * Update a task
         * PUT /tasks/{task_gid}
         * Note: For writeback - update task details
         * Important: Can update name, notes, due_on, assignee, custom_fields, completed, etc.
         */
        update: (taskGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/tasks/${taskGid}`,
            body: data,
            ...options
        }),

        /**
         * Delete a task
         * DELETE /tasks/{task_gid}
         */
        delete: (taskGid, options = {}) => ({
            method: 'DELETE',
            url: `${ASANA_API_BASE}/tasks/${taskGid}`,
            ...options
        }),

        /**
         * Duplicate a task
         * POST /tasks/{task_gid}/duplicate
         * Note: For writeback - clone tasks
         */
        duplicate: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/duplicate`,
            body: data,
            ...options
        }),

        /**
         * Get tasks from a project
         * GET /projects/{project_gid}/tasks
         */
        getByProject: (projectGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/projects/${projectGid}/tasks`,
            ...options
        }),

        /**
         * Get tasks from a section
         * GET /sections/{section_gid}/tasks
         */
        getBySection: (sectionGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/sections/${sectionGid}/tasks`,
            ...options
        }),

        /**
         * Get tasks from a tag
         * GET /tags/{tag_gid}/tasks
         */
        getByTag: (tagGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/tags/${tagGid}/tasks`,
            ...options
        }),

        /**
         * Get tasks from a user task list
         * GET /users/{user_gid}/user_task_list/tasks
         */
        getByUserTaskList: (userGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/users/${userGid}/user_task_list/tasks`,
            ...options
        }),

        /**
         * Get subtasks from a task
         * GET /tasks/{task_gid}/subtasks
         */
        getSubtasks: (taskGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/subtasks`,
            ...options
        }),

        /**
         * Create a subtask
         * POST /tasks/{task_gid}/subtasks
         * Note: For writeback - create child tasks
         */
        createSubtask: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/subtasks`,
            body: data,
            ...options
        }),

        /**
         * Set the parent of a task
         * POST /tasks/{task_gid}/setParent
         * Note: For writeback - set parent task
         */
        setParent: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/setParent`,
            body: data,
            ...options
        }),

        /**
         * Get dependencies from a task
         * GET /tasks/{task_gid}/dependencies
         */
        getDependencies: (taskGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/dependencies`,
            ...options
        }),

        /**
         * Set dependencies for a task
         * POST /tasks/{task_gid}/setDependencies
         * Note: For writeback - set task dependencies
         */
        setDependencies: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/setDependencies`,
            body: data,
            ...options
        }),

        /**
         * Unlink dependencies from a task
         * POST /tasks/{task_gid}/removeDependencies
         * Note: For writeback - remove dependencies
         */
        removeDependencies: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/removeDependencies`,
            body: data,
            ...options
        }),

        /**
         * Get dependents from a task
         * GET /tasks/{task_gid}/dependents
         */
        getDependents: (taskGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/dependents`,
            ...options
        }),

        /**
         * Set dependents for a task
         * POST /tasks/{task_gid}/setDependents
         * Note: For writeback - set dependent tasks
         */
        setDependents: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/setDependents`,
            body: data,
            ...options
        }),

        /**
         * Unlink dependents from a task
         * POST /tasks/{task_gid}/removeDependents
         * Note: For writeback - remove dependents
         */
        removeDependents: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/removeDependents`,
            body: data,
            ...options
        }),

        /**
         * Add a project to a task
         * POST /tasks/{task_gid}/addProject
         * Note: For writeback - add tasks to projects
         */
        addProject: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/addProject`,
            body: data,
            ...options
        }),

        /**
         * Remove a project from a task
         * POST /tasks/{task_gid}/removeProject
         * Note: For writeback - remove tasks from projects
         */
        removeProject: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/removeProject`,
            body: data,
            ...options
        }),

        /**
         * Add a tag to a task
         * POST /tasks/{task_gid}/addTag
         * Note: For writeback - tag tasks
         */
        addTag: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/addTag`,
            body: data,
            ...options
        }),

        /**
         * Remove a tag from a task
         * POST /tasks/{task_gid}/removeTag
         * Note: For writeback - untag tasks
         */
        removeTag: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/removeTag`,
            body: data,
            ...options
        }),

        /**
         * Add followers to a task
         * POST /tasks/{task_gid}/addFollowers
         * Note: For writeback - add followers
         */
        addFollowers: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/addFollowers`,
            body: data,
            ...options
        }),

        /**
         * Remove followers from a task
         * POST /tasks/{task_gid}/removeFollowers
         * Note: For writeback - remove followers
         */
        removeFollowers: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/removeFollowers`,
            body: data,
            ...options
        }),

        /**
         * Get a task for a given custom ID
         * GET /tasks/{custom_id}
         */
        getByCustomId: (customId, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/tasks/${customId}`,
            ...options
        }),

        /**
         * Search tasks in a workspace
         * GET /workspaces/{workspace_gid}/tasks/search
         */
        search: (workspaceGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}/tasks/search`,
            ...options
        })
    },

    // ============================================
    // STORIES (Comments/Activity)
    // ============================================
    stories: {
        /**
         * Get a story
         * GET /stories/{story_gid}
         */
        get: (storyGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/stories/${storyGid}`,
            ...options
        }),

        /**
         * Update a story
         * PUT /stories/{story_gid}
         * Note: For writeback - update comments/stories
         */
        update: (storyGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/stories/${storyGid}`,
            body: data,
            ...options
        }),

        /**
         * Delete a story
         * DELETE /stories/{story_gid}
         */
        delete: (storyGid, options = {}) => ({
            method: 'DELETE',
            url: `${ASANA_API_BASE}/stories/${storyGid}`,
            ...options
        }),

        /**
         * Get stories from a task
         * GET /tasks/{task_gid}/stories
         */
        getByTask: (taskGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/stories`,
            ...options
        }),

        /**
         * Create a story on a task
         * POST /tasks/{task_gid}/stories
         * Note: For writeback - add comments to tasks
         */
        create: (taskGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/stories`,
            body: data,
            ...options
        })
    },

    // ============================================
    // SECTIONS (Columns in Board View)
    // ============================================
    sections: {
        /**
         * Get a section
         * GET /sections/{section_gid}
         */
        get: (sectionGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/sections/${sectionGid}`,
            ...options
        }),

        /**
         * Update a section
         * PUT /sections/{section_gid}
         * Note: For writeback - update section/column names
         */
        update: (sectionGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/sections/${sectionGid}`,
            body: data,
            ...options
        }),

        /**
         * Delete a section
         * DELETE /sections/{section_gid}
         */
        delete: (sectionGid, options = {}) => ({
            method: 'DELETE',
            url: `${ASANA_API_BASE}/sections/${sectionGid}`,
            ...options
        }),

        /**
         * Get sections in a project
         * GET /projects/{project_gid}/sections
         */
        list: (projectGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/projects/${projectGid}/sections`,
            ...options
        }),

        /**
         * Create a section in a project
         * POST /projects/{project_gid}/sections
         * Note: For writeback - create new columns/sections
         */
        create: (projectGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/projects/${projectGid}/sections`,
            body: data,
            ...options
        }),

        /**
         * Add task to section
         * POST /sections/{section_gid}/addTask
         * Note: For writeback - move tasks to different columns
         */
        addTask: (sectionGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/sections/${sectionGid}/addTask`,
            body: data,
            ...options
        }),

        /**
         * Move or Insert sections
         * POST /sections/{section_gid}/insert
         * Note: For writeback - reorder sections/columns
         */
        insert: (sectionGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/sections/${sectionGid}/insert`,
            body: data,
            ...options
        })
    },

    // ============================================
    // TAGS
    // ============================================
    tags: {
        /**
         * Get multiple tags
         * GET /tags
         */
        list: (options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/tags`,
            ...options
        }),

        /**
         * Create a tag
         * POST /tags
         * Note: For writeback - create new tags
         */
        create: (data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/tags`,
            body: data,
            ...options
        }),

        /**
         * Get a tag
         * GET /tags/{tag_gid}
         */
        get: (tagGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/tags/${tagGid}`,
            ...options
        }),

        /**
         * Update a tag
         * PUT /tags/{tag_gid}
         * Note: For writeback - update tag details
         */
        update: (tagGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/tags/${tagGid}`,
            body: data,
            ...options
        }),

        /**
         * Delete a tag
         * DELETE /tags/{tag_gid}
         */
        delete: (tagGid, options = {}) => ({
            method: 'DELETE',
            url: `${ASANA_API_BASE}/tags/${tagGid}`,
            ...options
        }),

        /**
         * Get a task's tags
         * GET /tasks/{task_gid}/tags
         */
        getByTask: (taskGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/tasks/${taskGid}/tags`,
            ...options
        }),

        /**
         * Get tags in a workspace
         * GET /workspaces/{workspace_gid}/tags
         */
        getByWorkspace: (workspaceGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}/tags`,
            ...options
        }),

        /**
         * Create a tag in a workspace
         * POST /workspaces/{workspace_gid}/tags
         * Note: For writeback - create tags in workspaces
         */
        createInWorkspace: (workspaceGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}/tags`,
            body: data,
            ...options
        })
    },

    // ============================================
    // USERS
    // ============================================
    users: {
        /**
         * Get multiple users
         * GET /users
         */
        list: (options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/users`,
            ...options
        }),

        /**
         * Get a user
         * GET /users/{user_gid}
         */
        get: (userGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/users/${userGid}`,
            ...options
        }),

        /**
         * Get a user's favorites
         * GET /users/{user_gid}/favorites
         */
        getFavorites: (userGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/users/${userGid}/favorites`,
            ...options
        }),

        /**
         * Get users in a team
         * GET /teams/{team_gid}/users
         */
        getByTeam: (teamGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/teams/${teamGid}/users`,
            ...options
        }),

        /**
         * Get users in a workspace or organization
         * GET /workspaces/{workspace_gid}/users
         */
        getByWorkspace: (workspaceGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}/users`,
            ...options
        }),

        /**
         * Update a user
         * PUT /users/{user_gid}
         * Note: For writeback - update user details
         */
        update: (userGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/users/${userGid}`,
            body: data,
            ...options
        }),

        /**
         * Get a user in a workspace or organization
         * GET /workspaces/{workspace_gid}/users/{user_gid}
         */
        getInWorkspace: (workspaceGid, userGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}/users/${userGid}`,
            ...options
        }),

        /**
         * Update a user in a workspace or organization
         * PUT /workspaces/{workspace_gid}/users/{user_gid}
         * Note: For writeback - update user workspace settings
         */
        updateInWorkspace: (workspaceGid, userGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}/users/${userGid}`,
            body: data,
            ...options
        })
    },

    // ============================================
    // WORKSPACES
    // ============================================
    workspaces: {
        /**
         * Get multiple workspaces
         * GET /workspaces
         */
        list: (options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/workspaces`,
            ...options
        }),

        /**
         * Get a workspace
         * GET /workspaces/{workspace_gid}
         */
        get: (workspaceGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}`,
            ...options
        }),

        /**
         * Update a workspace
         * PUT /workspaces/{workspace_gid}
         * Note: For writeback - update workspace details
         */
        update: (workspaceGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}`,
            body: data,
            ...options
        }),

        /**
         * Add a user to a workspace or organization
         * POST /workspaces/{workspace_gid}/addUser
         * Note: For writeback - add users to workspaces
         */
        addUser: (workspaceGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}/addUser`,
            body: data,
            ...options
        }),

        /**
         * Remove a user from a workspace or organization
         * POST /workspaces/{workspace_gid}/removeUser
         * Note: For writeback - remove users from workspaces
         */
        removeUser: (workspaceGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}/removeUser`,
            body: data,
            ...options
        }),

        /**
         * Get workspace events
         * GET /workspaces/{workspace_gid}/events
         */
        getEvents: (workspaceGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/workspaces/${workspace_gid}/events`,
            ...options
        })
    },

    // ============================================
    // TEAMS
    // ============================================
    teams: {
        /**
         * Create a team
         * POST /teams
         * Note: For writeback - create new teams
         */
        create: (data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/teams`,
            body: data,
            ...options
        }),

        /**
         * Get a team
         * GET /teams/{team_gid}
         */
        get: (teamGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/teams/${teamGid}`,
            ...options
        }),

        /**
         * Update a team
         * PUT /teams/{team_gid}
         * Note: For writeback - update team details
         */
        update: (teamGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/teams/${teamGid}`,
            body: data,
            ...options
        }),

        /**
         * Get teams in a workspace
         * GET /workspaces/{workspace_gid}/teams
         */
        getByWorkspace: (workspaceGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/workspaces/${workspaceGid}/teams`,
            ...options
        }),

        /**
         * Get teams for a user
         * GET /users/{user_gid}/teams
         */
        getByUser: (userGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/users/${userGid}/teams`,
            ...options
        }),

        /**
         * Add a user to a team
         * POST /teams/{team_gid}/addUser
         * Note: For writeback - add users to teams
         */
        addUser: (teamGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/teams/${teamGid}/addUser`,
            body: data,
            ...options
        }),

        /**
         * Remove a user from a team
         * POST /teams/{team_gid}/removeUser
         * Note: For writeback - remove users from teams
         */
        removeUser: (teamGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/teams/${teamGid}/removeUser`,
            body: data,
            ...options
        })
    },

    // ============================================
    // PORTFOLIOS
    // ============================================
    portfolios: {
        /**
         * Get multiple portfolios
         * GET /portfolios
         */
        list: (options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/portfolios`,
            ...options
        }),

        /**
         * Create a portfolio
         * POST /portfolios
         * Note: For writeback - create portfolios
         */
        create: (data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/portfolios`,
            body: data,
            ...options
        }),

        /**
         * Get a portfolio
         * GET /portfolios/{portfolio_gid}
         */
        get: (portfolioGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/portfolios/${portfolioGid}`,
            ...options
        }),

        /**
         * Update a portfolio
         * PUT /portfolios/{portfolio_gid}
         * Note: For writeback - update portfolio details
         */
        update: (portfolioGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/portfolios/${portfolioGid}`,
            body: data,
            ...options
        }),

        /**
         * Delete a portfolio
         * DELETE /portfolios/{portfolio_gid}
         */
        delete: (portfolioGid, options = {}) => ({
            method: 'DELETE',
            url: `${ASANA_API_BASE}/portfolios/${portfolioGid}`,
            ...options
        }),

        /**
         * Get portfolio items
         * GET /portfolios/{portfolio_gid}/items
         */
        getItems: (portfolioGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/portfolios/${portfolioGid}/items`,
            ...options
        }),

        /**
         * Add a portfolio item
         * POST /portfolios/{portfolio_gid}/addItem
         * Note: For writeback - add projects to portfolios
         */
        addItem: (portfolioGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/portfolios/${portfolioGid}/addItem`,
            body: data,
            ...options
        }),

        /**
         * Remove a portfolio item
         * POST /portfolios/{portfolio_gid}/removeItem
         * Note: For writeback - remove projects from portfolios
         */
        removeItem: (portfolioGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/portfolios/${portfolioGid}/removeItem`,
            body: data,
            ...options
        }),

        /**
         * Add a custom field to a portfolio
         * POST /portfolios/{portfolio_gid}/addCustomFieldSetting
         * Note: For writeback - associate custom fields
         */
        addCustomField: (portfolioGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/portfolios/${portfolioGid}/addCustomFieldSetting`,
            body: data,
            ...options
        }),

        /**
         * Remove a custom field from a portfolio
         * POST /portfolios/{portfolio_gid}/removeCustomFieldSetting
         * Note: For writeback - remove custom field associations
         */
        removeCustomField: (portfolioGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/portfolios/${portfolioGid}/removeCustomFieldSetting`,
            body: data,
            ...options
        }),

        /**
         * Add users to a portfolio
         * POST /portfolios/{portfolio_gid}/addMembers
         * Note: For writeback - add members
         */
        addMembers: (portfolioGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/portfolios/${portfolioGid}/addMembers`,
            body: data,
            ...options
        }),

        /**
         * Remove users from a portfolio
         * POST /portfolios/{portfolio_gid}/removeMembers
         * Note: For writeback - remove members
         */
        removeMembers: (portfolioGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/portfolios/${portfolioGid}/removeMembers`,
            body: data,
            ...options
        })
    },

    // ============================================
    // PROJECT STATUSES
    // ============================================
    projectStatuses: {
        /**
         * Get a project status
         * GET /project_statuses/{project_status_gid}
         */
        get: (projectStatusGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/project_statuses/${projectStatusGid}`,
            ...options
        }),

        /**
         * Delete a project status
         * DELETE /project_statuses/{project_status_gid}
         */
        delete: (projectStatusGid, options = {}) => ({
            method: 'DELETE',
            url: `${ASANA_API_BASE}/project_statuses/${projectStatusGid}`,
            ...options
        }),

        /**
         * Get statuses from a project
         * GET /projects/{project_gid}/project_statuses
         */
        getByProject: (projectGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/projects/${projectGid}/project_statuses`,
            ...options
        }),

        /**
         * Create a project status
         * POST /projects/{project_gid}/project_statuses
         * Note: For writeback - create status updates
         */
        create: (projectGid, data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/projects/${projectGid}/project_statuses`,
            body: data,
            ...options
        })
    },

    // ============================================
    // WEBHOOKS (For real-time updates)
    // ============================================
    webhooks: {
        /**
         * Get multiple webhooks
         * GET /webhooks
         */
        list: (options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/webhooks`,
            ...options
        }),

        /**
         * Establish a webhook
         * POST /webhooks
         * Note: For writeback - set up real-time notifications
         */
        create: (data, options = {}) => ({
            method: 'POST',
            url: `${ASANA_API_BASE}/webhooks`,
            body: data,
            ...options
        }),

        /**
         * Get a webhook
         * GET /webhooks/{webhook_gid}
         */
        get: (webhookGid, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/webhooks/${webhookGid}`,
            ...options
        }),

        /**
         * Update a webhook
         * PUT /webhooks/{webhook_gid}
         * Note: For writeback - update webhook settings
         */
        update: (webhookGid, data, options = {}) => ({
            method: 'PUT',
            url: `${ASANA_API_BASE}/webhooks/${webhookGid}`,
            body: data,
            ...options
        }),

        /**
         * Delete a webhook
         * DELETE /webhooks/{webhook_gid}
         */
        delete: (webhookGid, options = {}) => ({
            method: 'DELETE',
            url: `${ASANA_API_BASE}/webhooks/${webhookGid}`,
            ...options
        })
    },

    // ============================================
    // EVENTS (For change tracking)
    // ============================================
    events: {
        /**
         * Get events on a resource
         * GET /events?resource={resource_gid}&sync={sync_token}
         * Note: Use for incremental sync - tracks changes to resources
         */
        get: (resourceGid, syncToken = null, options = {}) => ({
            method: 'GET',
            url: `${ASANA_API_BASE}/events`,
            params: {
                resource: resourceGid,
                ...(syncToken ? { sync: syncToken } : {})
            },
            ...options
        })
    }
};

/**
 * Helper function to make authenticated API requests
 * 
 * @param {Object} endpointConfig - Configuration from AsanaAPI object
 * @param {string} accessToken - Asana Personal Access Token or OAuth token
 * @returns {Promise} - Fetch promise
 * 
 * Example usage:
 * const endpoint = AsanaAPI.tasks.get('1234567890');
 * const response = await makeAsanaRequest(endpoint, ASANA_ACCESS_TOKEN);
 */
async function makeAsanaRequest(endpointConfig, accessToken) {
    const { method, url, body, params } = endpointConfig;
    
    // Build URL with query parameters
    let fullUrl = url;
    if (params) {
        const queryString = new URLSearchParams(params).toString();
        fullUrl += `?${queryString}`;
    }
    
    // Build request options
    const options = {
        method: method,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    };
    
    // Add body for POST/PUT requests
    if (body && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(body);
    }
    
    try {
        const response = await fetch(fullUrl, options);
        
        // Handle rate limiting
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After') || 60;
            console.warn(`Rate limited. Retrying after ${retryAfter} seconds...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return makeAsanaRequest(endpointConfig, accessToken);
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Asana API Error: ${error.message || response.statusText}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Asana API Request Error:', error);
        throw error;
    }
}

/**
 * Batch API helper for making multiple requests efficiently
 * 
 * @param {Array} requests - Array of endpoint configs
 * @param {string} accessToken - Asana access token
 * @returns {Promise} - Promise resolving to array of responses
 */
async function makeBatchRequest(requests, accessToken) {
    const batchEndpoint = {
        method: 'POST',
        url: `${ASANA_API_BASE}/batch`,
        body: {
            data: {
                actions: requests.map((req, index) => ({
                    relative_path: req.url.replace(ASANA_API_BASE, ''),
                    method: req.method,
                    options: req.params || {},
                    data: req.body || {},
                    ...(req.body ? { data: req.body } : {})
                }))
            }
        }
    };
    
    return makeAsanaRequest(batchEndpoint, accessToken);
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AsanaAPI, makeAsanaRequest, makeBatchRequest };
}

