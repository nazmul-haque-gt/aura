/**
 * gemini-tools.js - Gemini Live API Function Declarations & Tool Execution Handler
 * Connects voice instructions directly to the To-Do & Note store.
 */

const GEMINI_FUNCTION_DECLARATIONS = [
  {
    name: 'add_todo',
    description: 'Add a new to-do task or reminder to the user\'s to-do list.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title or short summary of the task (e.g. "Buy groceries", "Call Dr. Smith")'
        },
        description: {
          type: 'string',
          description: 'Optional additional details or notes for the task'
        },
        category: {
          type: 'string',
          description: 'Category name (e.g. "Personal", "Work", "Shopping", "Urgent")'
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Priority level of the task'
        },
        dueDate: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format, or relative date description'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'list_todos',
    description: 'Retrieve current to-do items from the list.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'pending', 'completed', 'today'],
          description: 'Filter by task completion status'
        },
        category: {
          type: 'string',
          description: 'Optional category filter'
        }
      }
    }
  },
  {
    name: 'complete_todo',
    description: 'Mark a task as completed in the to-do list.',
    parameters: {
      type: 'object',
      properties: {
        task_identifier: {
          type: 'string',
          description: 'Keyword, title, or substring of the task to mark as completed'
        }
      },
      required: ['task_identifier']
    }
  },
  {
    name: 'delete_todo',
    description: 'Delete or remove a task from the to-do list.',
    parameters: {
      type: 'object',
      properties: {
        task_identifier: {
          type: 'string',
          description: 'Keyword or title of the task to delete'
        }
      },
      required: ['task_identifier']
    }
  },
  {
    name: 'save_note',
    description: 'Write down and store a note, memo, thought, or text dictation.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short title or subject of the note'
        },
        content: {
          type: 'string',
          description: 'The main text or content of the note to store'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keywords or tags associated with this note'
        }
      },
      required: ['content']
    }
  },
  {
    name: 'get_notes',
    description: 'Retrieve stored notes or search through them.',
    parameters: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Keyword to search within notes'
        }
      }
    }
  },
  {
    name: 'get_current_time_and_date',
    description: 'Get current date, time, day of the week, and timezone.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_alarms',
    description: 'Retrieve all alarms currently set in the application, including their status, time, and label.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'set_alarm',
    description: 'Set a new alarm at a specific 24-hour time.',
    parameters: {
      type: 'object',
      properties: {
        time: {
          type: 'string',
          description: 'The time to trigger the alarm in 24-hour HH:MM format (e.g. "07:30", "15:45")'
        },
        label: {
          type: 'string',
          description: 'A descriptive name or label for the alarm (e.g. "Morning Wakeup", "Standup Call")'
        },
        repeatDays: {
          type: 'array',
          items: { type: 'integer' },
          description: 'Days of the week the alarm should repeat (1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun)'
        }
      },
      required: ['time']
    }
  },
  {
    name: 'toggle_alarm',
    description: 'Enable or disable (turn off) an alarm based on its time or label.',
    parameters: {
      type: 'object',
      properties: {
        alarm_identifier: {
          type: 'string',
          description: 'The specific alarm time (e.g. "07:30") or alarm label (e.g. "Wakeup") to modify'
        },
        enabled: {
          type: 'boolean',
          description: 'Set to true to enable the alarm, or false to disable/turn it off'
        }
      },
      required: ['alarm_identifier', 'enabled']
    }
  },
  {
    name: 'delete_alarm',
    description: 'Delete or remove an alarm from the schedule completely.',
    parameters: {
      type: 'object',
      properties: {
        alarm_identifier: {
          type: 'string',
          description: 'The alarm time (e.g. "07:30") or alarm label to completely delete'
        }
      },
      required: ['alarm_identifier']
    }
  }
];

class GeminiToolsExecutor {
  constructor(todoStore) {
    this.store = todoStore || window.todoStore;
    this.onActionExecuted = null; // Callback for UI notifications
  }

  getToolsDeclaration() {
    return [
      {
        function_declarations: GEMINI_FUNCTION_DECLARATIONS
      }
    ];
  }

  async executeTool(name, args = {}) {
    console.log(`🛠️ Executing Gemini Tool: [${name}]`, args);
    let result = { success: false };

    try {
      switch (name) {
        case 'add_todo': {
          let dueDate = args.dueDate || '';
          // Resolve relative dates like "today", "tomorrow"
          if (dueDate.toLowerCase() === 'today') {
            dueDate = new Date().toISOString().split('T')[0];
          } else if (dueDate.toLowerCase() === 'tomorrow') {
            const tom = new Date();
            tom.setDate(tom.getDate() + 1);
            dueDate = tom.toISOString().split('T')[0];
          }

          const todo = this.store.addTodo({
            title: args.title,
            description: args.description || '',
            category: args.category || 'Personal',
            priority: args.priority || 'medium',
            dueDate: dueDate
          });

          result = {
            success: true,
            message: `Task "${todo.title}" added to your to-do list.`,
            todo: todo
          };

          if (this.onActionExecuted) {
            this.onActionExecuted('add_todo', `Added task: "${todo.title}"`);
          }
          break;
        }

        case 'list_todos': {
          const todos = this.store.getTodos({
            status: args.status || 'pending',
            category: args.category || 'all'
          });

          result = {
            success: true,
            totalCount: todos.length,
            todos: todos.map(t => ({
              id: t.id,
              title: t.title,
              category: t.category,
              priority: t.priority,
              dueDate: t.dueDate,
              completed: t.completed
            }))
          };
          break;
        }

        case 'complete_todo': {
          const keyword = args.task_identifier;
          const found = this.store.findTodoByTitle(keyword);
          if (found) {
            const updated = this.store.updateTodo(found.id, { completed: true });
            result = {
              success: true,
              message: `Marked "${updated.title}" as completed.`,
              todo: updated
            };
            if (this.onActionExecuted) {
              this.onActionExecuted('complete_todo', `Completed: "${updated.title}"`);
            }
          } else {
            result = {
              success: false,
              message: `Could not find a task matching "${keyword}".`
            };
          }
          break;
        }

        case 'delete_todo': {
          const keyword = args.task_identifier;
          const found = this.store.findTodoByTitle(keyword);
          if (found) {
            this.store.deleteTodo(found.id);
            result = {
              success: true,
              message: `Deleted task "${found.title}".`
            };
            if (this.onActionExecuted) {
              this.onActionExecuted('delete_todo', `Deleted task: "${found.title}"`);
            }
          } else {
            result = {
              success: false,
              message: `Could not find a task matching "${keyword}" to delete.`
            };
          }
          break;
        }

        case 'save_note': {
          const note = this.store.addNote({
            title: args.title || 'Voice Note',
            content: args.content,
            tags: args.tags || ['Voice']
          });
          result = {
            success: true,
            message: `Note "${note.title}" saved.`,
            note: note
          };
          if (this.onActionExecuted) {
            this.onActionExecuted('save_note', `Saved note: "${note.title}"`);
          }
          break;
        }

        case 'get_notes': {
          const notes = this.store.getNotes({ search: args.search || '' });
          result = {
            success: true,
            totalCount: notes.length,
            notes: notes.slice(0, 10)
          };
          break;
        }

        case 'get_current_time_and_date': {
          const now = new Date();
          result = {
            success: true,
            formatted: now.toLocaleString(),
            date: now.toISOString().split('T')[0],
            dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
            time: now.toLocaleTimeString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          };
          break;
        }

        case 'list_alarms': {
          const alarms = this.store.getAlarms();
          result = {
            success: true,
            totalCount: alarms.length,
            alarms: alarms.map(a => ({
              id: a.id,
              time: a.time,
              label: a.label,
              repeatDays: a.repeatDays,
              enabled: a.enabled
            }))
          };
          break;
        }

        case 'set_alarm': {
          const alarm = this.store.addAlarm({
            time: args.time,
            label: args.label || 'Voice Alarm',
            repeatDays: args.repeatDays || []
          });
          result = {
            success: true,
            message: `Alarm set for ${alarm.time} ${alarm.label ? 'with label "' + alarm.label + '"' : ''}.`,
            alarm: alarm
          };
          if (this.onActionExecuted) {
            this.onActionExecuted('set_alarm', `Alarm set: ${alarm.time} (${alarm.label})`);
          }
          break;
        }

        case 'toggle_alarm': {
          const identifier = args.alarm_identifier.toLowerCase().trim();
          const enabled = args.enabled;
          const alarms = this.store.getAlarms();
          const found = alarms.find(a => 
            a.time.includes(identifier) || a.label.toLowerCase().includes(identifier)
          );

          if (found) {
            const updated = this.store.updateAlarm(found.id, { enabled });
            result = {
              success: true,
              message: `Alarm at ${updated.time} has been ${updated.enabled ? 'enabled' : 'disabled'}.`,
              alarm: updated
            };
            if (this.onActionExecuted) {
              this.onActionExecuted('toggle_alarm', `Alarm ${updated.time} ${updated.enabled ? 'Enabled' : 'Disabled'}`);
            }
          } else {
            result = {
              success: false,
              message: `Could not find an alarm matching "${args.alarm_identifier}" to modify.`
            };
          }
          break;
        }

        case 'delete_alarm': {
          const identifier = args.alarm_identifier.toLowerCase().trim();
          const alarms = this.store.getAlarms();
          const found = alarms.find(a => 
            a.time.includes(identifier) || a.label.toLowerCase().includes(identifier)
          );

          if (found) {
            this.store.deleteAlarm(found.id);
            result = {
              success: true,
              message: `Deleted alarm at ${found.time} (${found.label}).`
            };
            if (this.onActionExecuted) {
              this.onActionExecuted('delete_alarm', `Deleted alarm: ${found.time}`);
            }
          } else {
            result = {
              success: false,
              message: `Could not find an alarm matching "${args.alarm_identifier}" to delete.`
            };
          }
          break;
        }

        default:
          result = { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (err) {
      console.error(`Error executing tool ${name}:`, err);
      result = { success: false, error: err.message };
    }

    return result;
  }
}

window.GeminiToolsExecutor = GeminiToolsExecutor;
