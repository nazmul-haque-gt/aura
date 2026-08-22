/**
 * todo-store.js - Data Store for To-Do tasks and Notes
 * Supports CRUD operations, categorization, priority, status toggles, and persistence.
 */

class TodoStore {
  constructor() {
    this.TODO_STORAGE_KEY = 'gemini_assistant_todos_v1';
    this.NOTE_STORAGE_KEY = 'gemini_assistant_notes_v1';
    this.ALARM_STORAGE_KEY = 'gemini_assistant_alarms_v1';
    this.MEMORY_STORAGE_KEY = 'gemini_assistant_memory_v1';
    this.listeners = new Set();
    this.todos = this.loadTodos();
    this.notes = this.loadNotes();
    this.alarms = this.loadAlarms();
    this.memory = this.loadMemory();

    // Default sample data if empty
    if (this.todos.length === 0) {
      this.initSampleTodos();
    }
    if (this.notes.length === 0) {
      this.initSampleNotes();
    }
    if (this.alarms.length === 0) {
      this.initSampleAlarms();
    }
  }

  initSampleTodos() {
    this.todos = [
      {
        id: 'todo-' + Date.now() + '-1',
        title: 'Try Live Voice Assistant',
        description: 'Tap the microphone or say "Add task" to manage to-dos by voice',
        category: 'Personal',
        priority: 'high',
        dueDate: new Date().toISOString().split('T')[0],
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'todo-' + Date.now() + '-2',
        title: 'Configure Gemini API Key',
        description: 'Go to Settings tab to enter your Gemini API key for live voice',
        category: 'Work',
        priority: 'medium',
        dueDate: '',
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    this.saveTodos();
  }

  initSampleNotes() {
    this.notes = [
      {
        id: 'note-' + Date.now() + '-1',
        title: 'Welcome to Live Assistant',
        content: 'You can talk live to Gemini with real-time barge-in. Tell it to "Write down a note" or "Add a task" and it will do it automatically!',
        tags: ['Welcome', 'Voice'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    this.saveNotes();
  }

  initSampleAlarms() {
    this.alarms = [
      {
        id: 'alarm-' + Date.now() + '-1',
        time: '07:30',
        label: 'Morning Wakeup',
        repeatDays: [1, 2, 3, 4, 5], // Monday to Friday (1=Mon, 7=Sun)
        enabled: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'alarm-' + Date.now() + '-2',
        time: '09:00',
        label: 'Daily Standup Call',
        repeatDays: [1, 2, 3, 4, 5],
        enabled: false,
        createdAt: new Date().toISOString()
      }
    ];
    this.saveAlarms();
  }

  loadTodos() {
    try {
      const data = localStorage.getItem(this.TODO_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load todos from localStorage', e);
      return [];
    }
  }

  saveTodos() {
    try {
      localStorage.setItem(this.TODO_STORAGE_KEY, JSON.stringify(this.todos));
      this.notify();
    } catch (e) {
      console.error('Failed to save todos', e);
    }
  }

  loadNotes() {
    try {
      const data = localStorage.getItem(this.NOTE_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load notes from localStorage', e);
      return [];
    }
  }

  saveNotes() {
    try {
      localStorage.setItem(this.NOTE_STORAGE_KEY, JSON.stringify(this.notes));
      this.notify();
    } catch (e) {
      console.error('Failed to save notes', e);
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (e) {
        console.error('Error in store listener', e);
      }
    }
  }

  // --- To-Do Operations ---

  addTodo({ title, description = '', category = 'Personal', priority = 'medium', dueDate = '' }) {
    if (!title || !title.trim()) {
      throw new Error('Todo title is required');
    }

    const newTodo = {
      id: 'todo-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      title: title.trim(),
      description: description.trim(),
      category: category.trim() || 'Personal',
      priority: ['low', 'medium', 'high', 'urgent'].includes(priority.toLowerCase()) ? priority.toLowerCase() : 'medium',
      dueDate: dueDate || '',
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.todos.unshift(newTodo);
    this.saveTodos();
    return newTodo;
  }

  updateTodo(id, updates) {
    const index = this.todos.findIndex(t => t.id === id);
    if (index === -1) return null;

    this.todos[index] = {
      ...this.todos[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.saveTodos();
    return this.todos[index];
  }

  toggleTodo(id) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return null;
    return this.updateTodo(id, { completed: !todo.completed });
  }

  deleteTodo(id) {
    const index = this.todos.findIndex(t => t.id === id);
    if (index === -1) return false;
    const removed = this.todos.splice(index, 1)[0];
    this.saveTodos();
    return removed;
  }

  findTodoByTitle(keyword) {
    if (!keyword) return null;
    const clean = keyword.toLowerCase().trim();
    return this.todos.find(t => t.title.toLowerCase().includes(clean)) || null;
  }

  getTodos({ category = 'all', status = 'all', search = '', sortBy = 'newest' } = {}) {
    let list = [...this.todos];

    if (category && category !== 'all') {
      list = list.filter(t => t.category.toLowerCase() === category.toLowerCase());
    }

    if (status === 'completed') {
      list = list.filter(t => t.completed);
    } else if (status === 'pending') {
      list = list.filter(t => !t.completed);
    } else if (status === 'today') {
      const today = new Date().toISOString().split('T')[0];
      list = list.filter(t => !t.completed && t.dueDate === today);
    }

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(t => 
        t.title.toLowerCase().includes(q) || 
        (t.description && t.description.toLowerCase().includes(q)) ||
        t.category.toLowerCase().includes(q)
      );
    }

    if (sortBy === 'priority') {
      const pWeights = { urgent: 4, high: 3, medium: 2, low: 1 };
      list.sort((a, b) => (pWeights[b.priority] || 0) - (pWeights[a.priority] || 0));
    } else if (sortBy === 'dueDate') {
      list.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    } else {
      // newest first
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return list;
  }

  getCategories() {
    const cats = new Set(['Personal', 'Work', 'Shopping', 'Urgent']);
    this.todos.forEach(t => {
      if (t.category) cats.add(t.category);
    });
    return Array.from(cats);
  }

  // --- Note Operations ---

  addNote({ title = 'Untitled Note', content, tags = [] }) {
    if (!content || !content.trim()) {
      throw new Error('Note content is required');
    }

    const newNote = {
      id: 'note-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      title: (title && title.trim()) ? title.trim() : (content.slice(0, 30) + '...'),
      content: content.trim(),
      tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.notes.unshift(newNote);
    this.saveNotes();
    return newNote;
  }

  updateNote(id, updates) {
    const index = this.notes.findIndex(n => n.id === id);
    if (index === -1) return null;

    this.notes[index] = {
      ...this.notes[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.saveNotes();
    return this.notes[index];
  }

  deleteNote(id) {
    const index = this.notes.findIndex(n => n.id === id);
    if (index === -1) return false;
    const removed = this.notes.splice(index, 1)[0];
    this.saveNotes();
    return removed;
  }

  getNotes({ search = '' } = {}) {
    let list = [...this.notes];
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(n => 
        n.title.toLowerCase().includes(q) || 
        n.content.toLowerCase().includes(q) ||
        n.tags.some(tag => tag.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list;
  }

  // --- Memory Operations ---
  loadMemory() {
    try {
      return localStorage.getItem(this.MEMORY_STORAGE_KEY) || '';
    } catch (e) {
      console.error('Failed to load memory', e);
      return '';
    }
  }

  saveMemory(text) {
    try {
      this.memory = text;
      localStorage.setItem(this.MEMORY_STORAGE_KEY, text);
      this.notify();
      return true;
    } catch (e) {
      console.error('Failed to save memory', e);
      return false;
    }
  }

  // --- Alarm Operations ---
  loadAlarms() {
    try {
      const data = localStorage.getItem(this.ALARM_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load alarms', e);
      return [];
    }
  }

  saveAlarms() {
    try {
      localStorage.setItem(this.ALARM_STORAGE_KEY, JSON.stringify(this.alarms));
      this.notify();
    } catch (e) {
      console.error('Failed to save alarms', e);
    }
  }

  addAlarm({ time, label = 'Alarm', repeatDays = [], enabled = true }) {
    if (!time || !time.trim()) {
      throw new Error('Alarm time is required');
    }
    const newAlarm = {
      id: 'alarm-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      time: time.trim(), // e.g. "07:30"
      label: label.trim() || 'Alarm',
      repeatDays: Array.isArray(repeatDays) ? repeatDays : [], // [1, 2, 3, 4, 5]
      enabled: enabled !== false,
      createdAt: new Date().toISOString()
    };
    this.alarms.push(newAlarm);
    this.saveAlarms();
    return newAlarm;
  }

  updateAlarm(id, updates) {
    const index = this.alarms.findIndex(a => a.id === id);
    if (index === -1) return null;
    this.alarms[index] = {
      ...this.alarms[index],
      ...updates
    };
    this.saveAlarms();
    return this.alarms[index];
  }

  deleteAlarm(id) {
    const index = this.alarms.findIndex(a => a.id === id);
    if (index === -1) return false;
    const removed = this.alarms.splice(index, 1)[0];
    this.saveAlarms();
    return removed;
  }

  getAlarms() {
    return [...this.alarms].sort((a, b) => a.time.localeCompare(b.time));
  }

  // Export / Import
  exportData() {
    return JSON.stringify({
      todos: this.todos,
      notes: this.notes,
      alarms: this.alarms,
      memory: this.memory,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (Array.isArray(data.todos)) {
        this.todos = data.todos;
        this.saveTodos();
      }
      if (Array.isArray(data.notes)) {
        this.notes = data.notes;
        this.saveNotes();
      }
      if (Array.isArray(data.alarms)) {
        this.alarms = data.alarms;
        this.saveAlarms();
      }
      if (typeof data.memory === 'string') {
        this.memory = data.memory;
        this.saveMemory(data.memory);
      }
      return true;
    } catch (e) {
      console.error('Import failed', e);
      return false;
    }
  }
}

// Global singleton instance
window.todoStore = new TodoStore();
