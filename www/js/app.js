/**
 * app.js - Main Application Orchestrator
 * Connects UI, Voice Engine, Visualizer, To-Do Store, Notes, and Settings.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Settings & State ---
  const SETTINGS_KEY = 'aura_voice_settings_v1';
  let appSettings = {
    apiKey: '',
    voiceName: 'Aoede',
    model: 'models/gemini-2.0-flash-realtime-exp',
    systemPrompt: (
      "You are My Maya, a friendly, concise, and helpful live voice assistant for an Android app. " +
      "When the user asks you to manage their to-do list, reminders, or write notes, call the appropriate tools immediately. " +
      "Keep spoken answers short and natural."
    ),
    isMuted: false
  };

  // Load saved settings
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      appSettings = { ...appSettings, ...JSON.parse(saved) };
      if (appSettings.systemPrompt && appSettings.systemPrompt.includes("Aura")) {
        appSettings.systemPrompt = appSettings.systemPrompt.replace(/Aura/g, "My Maya");
      }
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }

  // --- Diagnostics System ---
  function logDiag(message) {
    const diagLog = document.getElementById('diagnosticsLog');
    if (diagLog) {
      const timestamp = new Date().toLocaleTimeString();
      diagLog.textContent += `\n[${timestamp}] ${message}`;
      diagLog.scrollTop = diagLog.scrollHeight;
    }
    console.log(`[Diag] ${message}`);
  }
  window.logDiag = logDiag;

  // --- Core Components ---
  const todoStore = window.todoStore;
  const canvas = document.getElementById('voiceOrbCanvas');
  const visualizer = new VoiceOrbVisualizer(canvas);
  visualizer.start();

  const audioRecorder = new AudioRecorder({
    onVolumeChange: (vol) => {
      visualizer.setUserVolume(vol);
    }
  });

  const audioPlayer = new AudioPlayer({
    onVolumeChange: (vol) => {
      visualizer.setAiVolume(vol);
    },
    onPlaybackEnded: () => {
      if (liveClient && liveClient.isConnected) {
        visualizer.setState('listening');
        updateStatus('live', 'Listening');
      } else {
        visualizer.setState('idle');
        updateStatus('ready', 'Ready');
      }
    }
  });

  const toolsExecutor = new GeminiToolsExecutor(todoStore);

  // Notify UI when voice tools add/update tasks
  toolsExecutor.onActionExecuted = (toolName, description) => {
    showToast(description, 'success');
    renderTasks();
    renderAlarms();
    renderNotes();
    playBeepSound();
  };

  let liveClient = null;

  // --- UI Elements ---
  const navItems = document.querySelectorAll('.nav-item');
  const tabViews = document.querySelectorAll('.tab-view');
  const fabAddTask = document.getElementById('fabAddTask');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const liveCaption = document.getElementById('liveCaption');
  const toggleLiveBtn = document.getElementById('toggleLiveBtn');
  const liveBtnIcon = document.getElementById('liveBtnIcon');
  const muteMicBtn = document.getElementById('muteMicBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const quickKeyBtn = document.getElementById('quickKeyBtn');

  // Modals
  const taskModal = document.getElementById('taskModal');
  const taskForm = document.getElementById('taskForm');
  const closeTaskModal = document.getElementById('closeTaskModal');
  const noteModal = document.getElementById('noteModal');
  const noteForm = document.getElementById('noteForm');
  const closeNoteModal = document.getElementById('closeNoteModal');
  const apiKeyModal = document.getElementById('apiKeyModal');
  const closeApiKeyModal = document.getElementById('closeApiKeyModal');

  // Tab 1: Live Voice
  function initLiveClient() {
    const finalSystemPrompt = appSettings.systemPrompt + (todoStore.memory ? "\n\nUser Memory & Interests (Keep this in mind when talking to the user):\n" + todoStore.memory : "");
    liveClient = new GeminiLiveClient({
      apiKey: appSettings.apiKey,
      model: appSettings.model,
      voiceName: appSettings.voiceName,
      systemPrompt: finalSystemPrompt,
      audioRecorder: audioRecorder,
      audioPlayer: audioPlayer,
      toolsExecutor: toolsExecutor,
      onStatusChange: (status, detail) => {
        handleClientStatusChange(status, detail);
      },
      onTranscript: (item) => {
        handleTranscript(item);
      },
      onInterrupted: () => {
        visualizer.setState('interrupted');
        updateStatus('interrupted', 'Interrupted');
        liveCaption.textContent = '⚡ Barge-in: Listening to you...';
        setTimeout(() => {
          if (liveClient && liveClient.isConnected) {
            visualizer.setState('listening');
            updateStatus('live', 'Listening');
          }
        }, 800);
      },
      onError: (err) => {
        showToast('Connection error. Check your API key.', 'error');
      }
    });
  }

  function handleClientStatusChange(status, detail) {
    if (status === 'connecting') {
      visualizer.setState('connecting');
      updateStatus('connecting', 'Connecting...');
      liveCaption.textContent = 'Connecting to Gemini Live...';
      liveCaption.classList.remove('placeholder');
    } else if (status === 'listening') {
      visualizer.setState('listening');
      updateStatus('live', 'Listening');
      toggleLiveBtn.classList.add('active');
      liveBtnIcon.textContent = '⏹';
      if (!liveCaption.textContent || liveCaption.classList.contains('placeholder')) {
        liveCaption.textContent = 'Listening... Speak naturally or interrupt anytime!';
        liveCaption.classList.remove('placeholder');
      }
    } else if (status === 'speaking') {
      visualizer.setState('speaking');
      updateStatus('speaking', 'Speaking');
    } else if (status === 'thinking') {
      visualizer.setState('thinking');
      updateStatus('connecting', 'Processing');
    } else if (status === 'idle') {
      visualizer.setState('idle');
      updateStatus('ready', 'Ready');
      toggleLiveBtn.classList.remove('active');
      liveBtnIcon.textContent = '⚡';
      liveCaption.textContent = 'Tap the microphone to start live conversation...';
      liveCaption.classList.add('placeholder');
    } else if (status === 'error') {
      visualizer.setState('idle');
      updateStatus('ready', 'Error');
      toggleLiveBtn.classList.remove('active');
      liveBtnIcon.textContent = '⚡';
      liveCaption.textContent = detail || 'Error occurred. Please check API key in Settings.';
    }
  }

  function handleTranscript(item) {
    liveCaption.textContent = (item.role === 'assistant' ? '🤖 ' : '👤 ') + item.text;
    liveCaption.classList.remove('placeholder');
    appendChatMessage(item.role, item.text);
  }

  async function toggleLiveSession() {
    if (!appSettings.apiKey) {
      openModal(apiKeyModal);
      return;
    }

    if (liveClient && liveClient.isConnected) {
      await liveClient.disconnect();
      showToast('Live session ended', 'info');
    } else {
      initLiveClient();
      try {
        await liveClient.connect();
        showToast('Connected to Gemini Live!', 'success');
      } catch (err) {
        showToast('Failed to connect: ' + err.message, 'error');
      }
    }
  }

  toggleLiveBtn.addEventListener('click', toggleLiveSession);

  // Mute / Unmute
  muteMicBtn.addEventListener('click', () => {
    appSettings.isMuted = !appSettings.isMuted;
    if (audioRecorder.mediaStream) {
      audioRecorder.mediaStream.getAudioTracks().forEach(t => {
        t.enabled = !appSettings.isMuted;
      });
    }
    muteMicBtn.style.color = appSettings.isMuted ? 'var(--accent-rose)' : 'var(--text-secondary)';
    showToast(appSettings.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
  });

  // Clear Chat / Transcript
  clearChatBtn.addEventListener('click', () => {
    const thread = document.getElementById('chatThread');
    thread.innerHTML = `
      <div class="chat-bubble assistant">
        Transcript cleared. My Maya is ready for live conversation!
      </div>
    `;
    liveCaption.textContent = 'Tap the microphone to start live conversation...';
    liveCaption.classList.add('placeholder');
    showToast('Transcript cleared', 'info');
  });

  // Suggestion Chips
  document.querySelectorAll('.suggest-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const prompt = chip.getAttribute('data-prompt');
      if (liveClient && liveClient.isConnected) {
        liveClient.sendTextMessage(prompt);
      } else {
        // Auto start live or send
        if (!appSettings.apiKey) {
          openModal(apiKeyModal);
          return;
        }
        await toggleLiveSession();
        setTimeout(() => {
          if (liveClient && liveClient.isConnected) {
            liveClient.sendTextMessage(prompt);
          }
        }, 1500);
      }
    });
  });

  // --- Tab Routing ---
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-target');
      
      navItems.forEach(n => n.classList.remove('active'));
      tabViews.forEach(v => v.classList.remove('active'));

      item.classList.add('active');
      const targetView = document.getElementById(targetId);
      if (targetView) {
        targetView.classList.add('active');
      }

      // Show/hide FAB for To-Do tasks
      if (targetId === 'view-todo') {
        const isTasksActive = document.getElementById('showTasksBtn').classList.contains('active');
        fabAddTask.style.display = isTasksActive ? 'flex' : 'none';
        if (isTasksActive) renderTasks();
        else renderAlarms();
      } else {
        fabAddTask.style.display = 'none';
      }

      // Refresh data
      if (targetId === 'view-notes') renderNotes();
      if (targetId === 'view-live') visualizer.resize();
    });
  });

  // --- To-Do List Management ---
  let currentCategory = 'all';
  let currentSearchQuery = '';

  const taskListContainer = document.getElementById('taskListContainer');
  const todoCountBadge = document.getElementById('todoCountBadge');
  const todoSearchInput = document.getElementById('todoSearchInput');
  const todoFilterContainer = document.getElementById('todoFilterContainer');

  function renderTasks() {
    const tasks = todoStore.getTodos({
      category: currentCategory,
      status: currentCategory === 'completed' ? 'completed' : (currentCategory === 'today' ? 'today' : 'all'),
      search: currentSearchQuery
    });

    todoCountBadge.textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;

    if (tasks.length === 0) {
      taskListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <h4>No tasks found</h4>
          <p>Tell My Maya to "Add task..." by voice or tap '+' to create one manually.</p>
        </div>
      `;
      return;
    }

    taskListContainer.innerHTML = tasks.map((task, index) => `
      <div class="task-card prio-${task.priority} ${task.completed ? 'completed' : ''}" data-id="${task.id}">
        <div class="task-checkbox ${task.completed ? 'checked' : ''}" onclick="toggleTask('${task.id}')">
          ${task.completed ? '✓' : ''}
        </div>
        <div class="task-body">
          <div class="task-title"><span class="task-number">${index + 1}.</span> ${escapeHtml(task.title)}</div>
          ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
          <div class="task-meta">
            <span class="meta-pill prio-tag ${task.priority}">${task.priority}</span>
            <span class="meta-pill">${escapeHtml(task.category)}</span>
            ${task.dueDate ? `<span class="meta-pill due-date">📅 ${task.dueDate}</span>` : ''}
          </div>
        </div>
        <div class="task-actions">
          <button class="card-action-btn" onclick="editTask('${task.id}')" title="Edit">✏️</button>
          <button class="card-action-btn delete" onclick="deleteTask('${task.id}')" title="Delete">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  window.toggleTask = (id) => {
    const updated = todoStore.toggleTodo(id);
    if (updated) {
      playBeepSound();
      renderTasks();
      showToast(updated.completed ? 'Task completed! 🎉' : 'Task marked pending', 'success');
    }
  };

  window.deleteTask = (id) => {
    const removed = todoStore.deleteTodo(id);
    if (removed) {
      renderTasks();
      showToast(`Deleted "${removed.title}"`, 'info');
    }
  };

  window.editTask = (id) => {
    const task = todoStore.todos.find(t => t.id === id);
    if (!task) return;

    document.getElementById('taskModalTitle').textContent = 'Edit Task';
    document.getElementById('taskIdInput').value = task.id;
    document.getElementById('taskTitleInput').value = task.title;
    document.getElementById('taskDescInput').value = task.description || '';
    document.getElementById('taskCategorySelect').value = task.category || 'Personal';
    document.getElementById('taskDueDateInput').value = task.dueDate || '';
    setTaskPrioritySelection(task.priority || 'medium');

    openModal(taskModal);
  };

  // Filter Pills
  todoFilterContainer.addEventListener('click', (e) => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    todoFilterContainer.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentCategory = pill.getAttribute('data-category');
    renderTasks();
  });

  // Search Input
  todoSearchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    renderTasks();
  });

  // Add Task FAB
  fabAddTask.addEventListener('click', () => {
    document.getElementById('taskModalTitle').textContent = 'New Task';
    document.getElementById('taskIdInput').value = '';
    taskForm.reset();
    setTaskPrioritySelection('medium');
    openModal(taskModal);
  });

  // Priority Selector in Task Modal
  const prioritySelector = document.getElementById('prioritySelector');
  const taskPriorityInput = document.getElementById('taskPriorityInput');

  function setTaskPrioritySelection(prio) {
    taskPriorityInput.value = prio;
    prioritySelector.querySelectorAll('.prio-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.getAttribute('data-prio') === prio);
    });
  }

  prioritySelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.prio-btn');
    if (!btn) return;
    setTaskPrioritySelection(btn.getAttribute('data-prio'));
  });

  // Save Task Form
  taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('taskIdInput').value;
    const title = document.getElementById('taskTitleInput').value.trim();
    const description = document.getElementById('taskDescInput').value.trim();
    const category = document.getElementById('taskCategorySelect').value;
    const priority = taskPriorityInput.value;
    const dueDate = document.getElementById('taskDueDateInput').value;

    if (!title) return;

    if (id) {
      todoStore.updateTodo(id, { title, description, category, priority, dueDate });
      showToast('Task updated!', 'success');
    } else {
      todoStore.addTodo({ title, description, category, priority, dueDate });
      showToast('Task added!', 'success');
    }

    closeModal(taskModal);
    renderTasks();
  });

  // --- Notes Management ---
  const notesListContainer = document.getElementById('notesListContainer');
  const noteSearchInput = document.getElementById('noteSearchInput');
  const newNoteBtn = document.getElementById('newNoteBtn');

  function renderNotes() {
    const search = noteSearchInput.value;
    const notes = todoStore.getNotes({ search });

    if (notes.length === 0) {
      notesListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💡</div>
          <h4>No notes yet</h4>
          <p>Tell My Maya "Write down a note" or tap '+ New Note'.</p>
        </div>
      `;
      return;
    }

    notesListContainer.innerHTML = notes.map(note => `
      <div class="note-card" data-id="${note.id}">
        <div class="note-header">
          <div class="note-title">${escapeHtml(note.title)}</div>
          <div class="task-actions">
            <button class="card-action-btn" onclick="copyNote('${note.id}')" title="Copy Text">📋</button>
            <button class="card-action-btn" onclick="editNote('${note.id}')" title="Edit">✏️</button>
            <button class="card-action-btn delete" onclick="deleteNote('${note.id}')" title="Delete">🗑️</button>
          </div>
        </div>
        <div class="note-content">${escapeHtml(note.content)}</div>
        <div class="note-footer">
          <span class="note-date">${new Date(note.createdAt).toLocaleDateString()}</span>
          <div class="tag-list">
            ${(note.tags || []).map(t => `<span class="tag-pill">#${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      </div>
    `).join('');
  }

  window.copyNote = (id) => {
    const note = todoStore.notes.find(n => n.id === id);
    if (note) {
      navigator.clipboard.writeText(note.title + '\n\n' + note.content);
      showToast('Copied note to clipboard!', 'success');
    }
  };

  window.deleteNote = (id) => {
    const removed = todoStore.deleteNote(id);
    if (removed) {
      renderNotes();
      showToast('Note deleted', 'info');
    }
  };

  window.editNote = (id) => {
    const note = todoStore.notes.find(n => n.id === id);
    if (!note) return;

    document.getElementById('noteModalTitle').textContent = 'Edit Note';
    document.getElementById('noteIdInput').value = note.id;
    document.getElementById('noteTitleInput').value = note.title;
    document.getElementById('noteContentInput').value = note.content;
    document.getElementById('noteTagsInput').value = (note.tags || []).join(', ');

    openModal(noteModal);
  };

  newNoteBtn.addEventListener('click', () => {
    document.getElementById('noteModalTitle').textContent = 'New Note';
    document.getElementById('noteIdInput').value = '';
    noteForm.reset();
    openModal(noteModal);
  });

  noteSearchInput.addEventListener('input', renderNotes);

  noteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('noteIdInput').value;
    const title = document.getElementById('noteTitleInput').value.trim();
    const content = document.getElementById('noteContentInput').value.trim();
    const tags = document.getElementById('noteTagsInput').value
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    if (!content) return;

    if (id) {
      todoStore.updateNote(id, { title, content, tags });
      showToast('Note updated!', 'success');
    } else {
      todoStore.addNote({ title, content, tags });
      showToast('Note saved!', 'success');
    }

    closeModal(noteModal);
    renderNotes();
  });

  // --- Voice Dictation for Modal Form Inputs (STT) ---
  setupDictationButton('dictateTaskTitle', 'taskTitleInput');
  setupDictationButton('dictateTaskDesc', 'taskDescInput');
  setupDictationButton('dictateNoteTitle', 'noteTitleInput');
  setupDictationButton('dictateNoteContent', 'noteContentInput');

  function setupDictationButton(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      btn.style.display = 'none';
      return;
    }

    const recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = false;

    btn.addEventListener('click', () => {
      try {
        btn.classList.add('listening');
        recognition.start();
      } catch (e) {
        recognition.stop();
      }
    });

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (input.tagName === 'TEXTAREA') {
        input.value = (input.value ? input.value + ' ' : '') + transcript;
      } else {
        input.value = transcript;
      }
      btn.classList.remove('listening');
    };

    recognition.onerror = () => btn.classList.remove('listening');
    recognition.onend = () => btn.classList.remove('listening');
  }

  // --- Chat / Transcript Thread ---
  const chatThread = document.getElementById('chatThread');
  const chatTextInput = document.getElementById('chatTextInput');
  const chatSendBtn = document.getElementById('chatSendBtn');

  function appendChatMessage(role, text) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    bubble.textContent = text;
    chatThread.appendChild(bubble);
    chatThread.scrollTop = chatThread.scrollHeight;
  }

  function handleSendChatMessage() {
    const text = chatTextInput.value.trim();
    if (!text) return;
    chatTextInput.value = '';

    if (liveClient && liveClient.isConnected) {
      liveClient.sendTextMessage(text);
    } else {
      appendChatMessage('user', text);
      // If not live connected, attempt to start or simulate
      if (!appSettings.apiKey) {
        openModal(apiKeyModal);
        return;
      }
      toggleLiveSession().then(() => {
        if (liveClient && liveClient.isConnected) {
          liveClient.sendTextMessage(text);
        }
      });
    }
  }

  chatSendBtn.addEventListener('click', handleSendChatMessage);
  chatTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendChatMessage();
  });

  // --- Settings Tab Event Handlers ---
  const apiKeyInput = document.getElementById('apiKeyInput');
  const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
  const testApiKeyBtn = document.getElementById('testApiKeyBtn');
  const voiceSelector = document.getElementById('voiceSelector');
  const systemPromptInput = document.getElementById('systemPromptInput');
  const saveVoiceSettingsBtn = document.getElementById('saveVoiceSettingsBtn');
  const exportDataBtn = document.getElementById('exportDataBtn');
  const importDataBtn = document.getElementById('importDataBtn');
  const importFileInput = document.getElementById('importFileInput');
  const clearAllDataBtn = document.getElementById('clearAllDataBtn');

  // Populate settings form
  if (appSettings.apiKey) apiKeyInput.value = appSettings.apiKey;
  if (appSettings.systemPrompt) systemPromptInput.value = appSettings.systemPrompt;

  // Model Selection
  const modelSelect = document.getElementById('modelSelect');
  if (appSettings.model) {
    modelSelect.value = appSettings.model;
  } else {
    appSettings.model = 'models/gemini-2.0-flash-realtime-exp';
    saveSettings();
  }
  modelSelect.addEventListener('change', () => {
    appSettings.model = modelSelect.value;
    saveSettings();
    showToast(`Model set to ${appSettings.model}`, 'info');
  });

  // Voice Selection
  voiceSelector.querySelectorAll('.voice-option').forEach(opt => {
    if (opt.getAttribute('data-voice') === appSettings.voiceName) {
      opt.classList.add('selected');
    } else {
      opt.classList.remove('selected');
    }

    opt.addEventListener('click', () => {
      voiceSelector.querySelectorAll('.voice-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      appSettings.voiceName = opt.getAttribute('data-voice');
      saveSettings();
      showToast(`Voice set to ${appSettings.voiceName}`, 'info');
    });
  });

  // Toggle Password visibility
  toggleKeyVisibility.addEventListener('click', () => {
    const isPass = apiKeyInput.type === 'password';
    apiKeyInput.type = isPass ? 'text' : 'password';
    toggleKeyVisibility.textContent = isPass ? '🔒' : '👁️';
  });

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
  }

  saveApiKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showToast('Please enter a valid API key', 'error');
      return;
    }
    appSettings.apiKey = key;
    saveSettings();
    showToast('Gemini API key saved!', 'success');
  });

  testApiKeyBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim() || appSettings.apiKey;
    if (!key) {
      showToast('Enter API key first', 'error');
      return;
    }
    testApiKeyBtn.textContent = 'Testing...';
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (data.models && data.models.length > 0) {
        showToast('✅ Gemini API Key is valid and working!', 'success');
      } else {
        showToast('❌ Invalid API Key response: ' + (data.error?.message || 'Unknown error'), 'error');
      }
    } catch (e) {
      showToast('❌ Network error testing key: ' + e.message, 'error');
    } finally {
      testApiKeyBtn.textContent = 'Test Connection';
    }
  });

  saveVoiceSettingsBtn.addEventListener('click', () => {
    appSettings.systemPrompt = systemPromptInput.value.trim();
    saveSettings();
    showToast('Voice & Persona settings updated!', 'success');
  });

  // Data Export / Import
  exportDataBtn.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(todoStore.exportData());
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `maya_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    showToast('Backup downloaded!', 'success');
  });

  importDataBtn.addEventListener('click', () => {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const success = todoStore.importData(event.target.result);
      if (success) {
        renderTasks();
        renderNotes();
        showToast('Data imported successfully!', 'success');
      } else {
        showToast('Invalid backup file format', 'error');
      }
    };
    reader.readAsText(file);
  });

  clearAllDataBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all tasks and notes?')) {
      localStorage.removeItem(todoStore.TODO_STORAGE_KEY);
      localStorage.removeItem(todoStore.NOTE_STORAGE_KEY);
      todoStore.todos = [];
      todoStore.notes = [];
      todoStore.initSampleTodos();
      todoStore.initSampleNotes();
      renderTasks();
      renderNotes();
      showToast('App data reset to default', 'info');
    }
  });

  // API Key Quick Modal
  quickKeyBtn.addEventListener('click', () => {
    document.getElementById('modalApiKeyInput').value = appSettings.apiKey || '';
    openModal(apiKeyModal);
  });

  document.getElementById('modalSaveApiKeyBtn').addEventListener('click', () => {
    const key = document.getElementById('modalApiKeyInput').value.trim();
    if (key) {
      appSettings.apiKey = key;
      apiKeyInput.value = key;
      saveSettings();
      closeModal(apiKeyModal);
      showToast('API Key saved! Starting live voice...', 'success');
      toggleLiveSession();
    } else {
      showToast('Please enter an API key', 'error');
    }
  });

  // --- Modal Helpers ---
  function openModal(modal) {
    modal.classList.add('active');
  }

  function closeModal(modal) {
    modal.classList.remove('active');
  }

  closeTaskModal.addEventListener('click', () => closeModal(taskModal));
  closeNoteModal.addEventListener('click', () => closeModal(noteModal));
  closeApiKeyModal.addEventListener('click', () => closeModal(apiKeyModal));

  [taskModal, noteModal, apiKeyModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  // --- Toast System ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function updateStatus(stateClass, text) {
    statusBadge.className = `status-badge ${stateClass}`;
    statusText.textContent = text;
  }

  function playBeepSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- PWA Installation Prompt ---
  let deferredPrompt;
  const installPwaBtn = document.getElementById('installPwaBtn');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installPwaBtn.style.display = 'block';
  });

  installPwaBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        installPwaBtn.style.display = 'none';
        showToast('My Maya installed to your device!', 'success');
      }
      deferredPrompt = null;
    }
  });

  // ==========================================================================
  // Segmented Control switcher logic
  // ==========================================================================
  const showTasksBtn = document.getElementById('showTasksBtn');
  const showAlarmsBtn = document.getElementById('showAlarmsBtn');
  const tasksSubView = document.getElementById('tasksSubView');
  const alarmsSubView = document.getElementById('alarmsSubView');

  showTasksBtn.addEventListener('click', () => {
    showTasksBtn.classList.add('active');
    showAlarmsBtn.classList.remove('active');
    tasksSubView.style.display = 'block';
    alarmsSubView.style.display = 'none';
    fabAddTask.style.display = 'flex';
    renderTasks();
  });

  showAlarmsBtn.addEventListener('click', () => {
    showAlarmsBtn.classList.add('active');
    showTasksBtn.classList.remove('active');
    alarmsSubView.style.display = 'block';
    tasksSubView.style.display = 'none';
    fabAddTask.style.display = 'none';
    renderAlarms();
  });

  // ==========================================================================
  // Alarm Management UI & Bindings
  // ==========================================================================
  const alarmsListContainer = document.getElementById('alarmsListContainer');
  const alarmModal = document.getElementById('alarmModal');
  const closeAlarmModal = document.getElementById('closeAlarmModal');
  const alarmForm = document.getElementById('alarmForm');

  function renderAlarms() {
    const alarms = todoStore.getAlarms();
    if (alarms.length === 0) {
      alarmsListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⏰</div>
          <h4>No alarms set</h4>
          <p>Tell My Maya "Set alarm at..." by voice or click "+ Add Alarm".</p>
        </div>
      `;
      return;
    }

    const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    alarmsListContainer.innerHTML = alarms.map(alarm => {
      const daysHtml = dayNames.map((day, dIdx) => {
        const active = alarm.repeatDays.includes(dIdx + 1) ? 'active' : '';
        return `<span class="alarm-day-badge ${active}">${day}</span>`;
      }).join('');

      return `
        <div class="alarm-card ${alarm.enabled ? '' : 'disabled'}" data-id="${alarm.id}">
          <div class="alarm-time-info">
            <div class="alarm-time-display">${alarm.time}</div>
            ${alarm.label ? `<div class="alarm-label-display">${escapeHtml(alarm.label)}</div>` : ''}
            <div class="alarm-repeat-days">${daysHtml}</div>
          </div>
          <div class="alarm-action-side">
            <label class="switch">
              <input type="checkbox" ${alarm.enabled ? 'checked' : ''} onchange="toggleAlarmEnabled('${alarm.id}')">
              <span class="slider"></span>
            </label>
            <button class="card-action-btn delete" onclick="deleteAlarmCard('${alarm.id}')" title="Delete">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }

  window.toggleAlarmEnabled = (id) => {
    const alarm = todoStore.alarms.find(a => a.id === id);
    if (alarm) {
      const updated = todoStore.updateAlarm(id, { enabled: !alarm.enabled });
      renderAlarms();
      showToast(`Alarm at ${updated.time} ${updated.enabled ? 'enabled' : 'disabled'}`, 'info');
    }
  };

  window.deleteAlarmCard = (id) => {
    const removed = todoStore.deleteAlarm(id);
    if (removed) {
      renderAlarms();
      showToast(`Deleted alarm at ${removed.time}`, 'info');
    }
  };

  document.getElementById('newAlarmBtn').addEventListener('click', () => {
    document.getElementById('alarmModalTitle').textContent = 'New Alarm';
    document.getElementById('alarmIdInput').value = '';
    alarmForm.reset();
    openModal(alarmModal);
  });

  closeAlarmModal.addEventListener('click', () => closeModal(alarmModal));

  alarmForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('alarmIdInput').value;
    const time = document.getElementById('alarmTimeInput').value;
    const label = document.getElementById('alarmLabelInput').value.trim();
    
    const repeatDays = [];
    alarmForm.querySelectorAll('.days-selector input[type="checkbox"]:checked').forEach(cb => {
      repeatDays.push(parseInt(cb.value));
    });

    if (!time) return;

    if (id) {
      todoStore.updateAlarm(id, { time, label, repeatDays });
      showToast('Alarm updated!', 'success');
    } else {
      todoStore.addAlarm({ time, label, repeatDays });
      showToast('Alarm saved!', 'success');
    }

    closeModal(alarmModal);
    renderAlarms();
  });

  // ==========================================================================
  // Real-time Background Alarm Ringing & Checking Logic
  // ==========================================================================
  const alarmRingingModal = document.getElementById('alarmRingingModal');
  const ringingTime = document.getElementById('ringingTime');
  const ringingLabel = document.getElementById('ringingLabel');
  const dismissAlarmBtn = document.getElementById('dismissAlarmBtn');
  const snoozeAlarmBtn = document.getElementById('snoozeAlarmBtn');

  let activeAlarmBeepInterval = null;
  let ringingAlarm = null;

  function startAlarmChecking() {
    setInterval(() => {
      if (ringingAlarm) return; // Already ringing

      const now = new Date();
      const currentHHMM = now.toTimeString().split(' ')[0].substring(0, 5); // "HH:MM"
      const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      // Map standard Date.getDay() (0=Sun, 1=Mon, ..., 6=Sat) to ISO (1=Mon, ..., 7=Sun)
      const isoDay = currentDay === 0 ? 7 : currentDay;

      const alarms = todoStore.getAlarms();
      const match = alarms.find(alarm => {
        if (!alarm.enabled) return false;
        if (alarm.time !== currentHHMM) return false;

        // If repeating days are set, check if today is included
        if (alarm.repeatDays && alarm.repeatDays.length > 0) {
          return alarm.repeatDays.includes(isoDay);
        }

        // One-time alarm, fires once
        return true;
      });

      // Avoid double trigger within the same minute: check if this alarm just fired
      if (match && (!window.lastFiredAlarmId || window.lastFiredAlarmId !== match.id || window.lastFiredMinute !== currentHHMM)) {
        window.lastFiredAlarmId = match.id;
        window.lastFiredMinute = currentHHMM;
        triggerAlarmRinging(match);
      }
    }, 1000);
  }

  function triggerAlarmRinging(alarm) {
    ringingAlarm = alarm;
    ringingTime.textContent = alarm.time;
    ringingLabel.textContent = alarm.label || 'Alarm';
    openModal(alarmRingingModal);
    playRingingBeepBeep();
  }

  function playRingingBeepBeep() {
    if (activeAlarmBeepInterval) clearInterval(activeAlarmBeepInterval);

    const playBeep = () => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // Pitch A5
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch (e) {}
    };

    // Double beep beep pattern
    activeAlarmBeepInterval = setInterval(() => {
      playBeep();
      setTimeout(playBeep, 200);
    }, 1200);
  }

  function stopRinging() {
    if (activeAlarmBeepInterval) {
      clearInterval(activeAlarmBeepInterval);
      activeAlarmBeepInterval = null;
    }
    closeModal(alarmRingingModal);
    ringingAlarm = null;
  }

  dismissAlarmBtn.addEventListener('click', () => {
    const alarm = ringingAlarm;
    stopRinging();
    if (alarm) {
      // One-time alarms are automatically disabled after ringing
      if (!alarm.repeatDays || alarm.repeatDays.length === 0) {
        todoStore.updateAlarm(alarm.id, { enabled: false });
        renderAlarms();
      }
      showToast('Alarm dismissed', 'info');
    }
  });

  snoozeAlarmBtn.addEventListener('click', () => {
    const alarm = ringingAlarm;
    stopRinging();
    if (alarm) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 5);
      const snoozeTimeStr = now.toTimeString().split(' ')[0].substring(0, 5);

      todoStore.addAlarm({
        time: snoozeTimeStr,
        label: `Snooze: ${alarm.label || 'Alarm'}`,
        repeatDays: [],
        enabled: true
      });
      renderAlarms();
      showToast(`Alarm snoozed for 5 minutes (${snoozeTimeStr})`, 'success');
    }
  });

  // Start background monitor
  startAlarmChecking();

  // ==========================================================================
  // User Memory Settings Handlers
  // ==========================================================================
  const userMemoryInput = document.getElementById('userMemoryInput');
  const saveMemoryBtn = document.getElementById('saveMemoryBtn');

  if (todoStore.memory) {
    userMemoryInput.value = todoStore.memory;
  }

  saveMemoryBtn.addEventListener('click', () => {
    const text = userMemoryInput.value.trim();
    todoStore.saveMemory(text);
    showToast('My Maya memory updated!', 'success');
  });

  // Initial renders
  renderTasks();
  renderAlarms();
  renderNotes();
});
