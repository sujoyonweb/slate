// js/state.js
import { Storage } from './storage.js';

export const State = {
    currentDateKey: null, 
    dates: [],
    tasks: [],
    routines: [],
    routineOverrides: {}, 
    routineCompletions: {},
    subtaskStates: {}, 
    inbox: [], // NEW: Inbox storage
    inboxLimit: 15,       // <-- EDIT THIS to change your max storage limit
    soundEnabled: true,
    inboxVisibleLimit: 3, // <-- EDIT THIS to change how many show on the timeline
    deletedIds: [], // <-- The Invisible Trash Bin for Sync!

    init() {
        this.runGarbageCollector();

        this.generateDates();
        const today = this.dates.find(d => d.isToday);
        this.currentDateKey = today ? today.key : this.dates[0].key;
        this.loadData();
    },

    generateDates() {
        this.dates = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = -1; i <= 5; i++) {
            const target = new Date(today);
            target.setDate(today.getDate() + i);
            
            const yyyy = target.getFullYear();
            const mm = String(target.getMonth() + 1).padStart(2, '0');
            const dd = String(target.getDate()).padStart(2, '0');
            const key = `${yyyy}-${mm}-${dd}`;

            this.dates.push({
                key: key,
                dayName: target.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0),
                dateNum: target.getDate(),
                isToday: i === 0
            });
        }
    },

    loadData() {
        this.tasks = Storage.get(`tasks_${this.currentDateKey}`, []);
        this.routines = Storage.get('master_routines', []);
        this.routineOverrides = Storage.get('routine_overrides', {});
        this.routineCompletions = Storage.get('routine_completions', {}); 
        this.subtaskStates = Storage.get('subtask_states', {});
        this.inbox = Storage.get('unscheduled_inbox', []); // NEW: Load inbox

        // NEW: Load settings and invisible trash bin
        this.inboxLimit = Storage.get('settings_inboxLimit', 15);
        this.deletedIds = Storage.get('deleted_ids', []);
        this.soundEnabled = Storage.get('settings_soundEnabled', true);
    },

    changeDate(newDateKey) {
        if (this.currentDateKey === newDateKey) return false;
        this.currentDateKey = newDateKey;
        this.loadData();
        return true;
    },
    
    addTask(time24, title, subtasksArray) {
        const newTask = {
            id: 't_' + Date.now(),
            time: time24, 
            title: title,
            subtasks: subtasksArray,
            status: 'pending',
            type: 'task'
        };
        this.tasks.push(newTask);
        this.tasks.sort((a, b) => a.time.localeCompare(b.time));
        
        import('./storage.js').then(module => {
            module.Storage.set(`tasks_${this.currentDateKey}`, this.tasks);
        });
    },

    addRoutine(time24, title, daysArray, subtasksArray = []) {
        const newRoutine = {
            id: 'r_' + Date.now(),
            time: time24,
            title: title,
            days: daysArray,
            subtasks: subtasksArray, // NEW: Saves subtasks!
            type: 'routine'
        };
        this.routines.push(newRoutine);
        this.routines.sort((a, b) => a.time.localeCompare(b.time));
        
        import('./storage.js').then(module => {
            module.Storage.set('master_routines', this.routines);
        });
    },

    // --- NEW: INBOX METHODS ---
    addInboxItem(title, subtasksArray = []) {
        if (this.inbox.length >= this.inboxLimit) return false; // Rejects it if full
        
        const newItem = {
            id: 'i_' + Date.now(),
            title: title,
            subtasks: subtasksArray,
            type: 'inbox'
        };
        this.inbox.push(newItem);
        import('./storage.js').then(module => {
            module.Storage.set('unscheduled_inbox', this.inbox);
        });
        return true; // Reports success
    },

    deleteInboxItem(inboxId) {
        // 1. Remove the item from the active inbox array
        this.inbox = this.inbox.filter(item => item.id !== inboxId);
        
        // 2. Toss it in the Invisible Trash Bin for your Sync Engine
        if (typeof this.trackDeletedId === 'function') {
            this.trackDeletedId(inboxId);
        }

        // 3. Save the newly cleaned inbox to your local database
        import('./storage.js').then(module => {
            module.Storage.set('unscheduled_inbox', this.inbox);
        });
    },
    // --------------------------

    updateTask(id, time, title, subtasks) {
        const task = this.tasks.find(t => t.id == id);
        if (task) {
            task.time = time;
            task.title = title;
            task.subtasks = subtasks;
            
            import('./storage.js').then(module => {
                module.Storage.set(`tasks_${this.currentDateKey}`, this.tasks);
            });
        }
    },

    updateRoutine(id, time, title, days, subtasksArray = []) {
        const routine = this.routines.find(r => r.id == id);
        if (routine) {
            routine.time = time;
            routine.title = title;
            routine.days = days;
            routine.subtasks = subtasksArray; // NEW: Updates subtasks!
            
            import('./storage.js').then(module => {
                module.Storage.set('master_routines', this.routines);
            });
        }
    },

    hasRoutineOverlap(time24, newDaysArray) {
        return this.routines.some(routine => {
            if (routine.time === time24) {
                return routine.days.some(day => newDaysArray.includes(day));
            }
            return false;
        });
    },

    toggleSubtask(blockId, subtaskIndex, dateKey) {
        const key = `${dateKey}_${blockId}`;
        if (!this.subtaskStates[key]) {
            this.subtaskStates[key] = [];
        }
        
        const arr = this.subtaskStates[key];
        const pos = arr.indexOf(subtaskIndex);
        
        if (pos > -1) {
            arr.splice(pos, 1);
        } else {
            arr.push(subtaskIndex); 
        }
        
        import('./storage.js').then(module => {
            module.Storage.set('subtask_states', this.subtaskStates);
        });
        
        return arr.length; 
    },

    deleteRoutine(routineId) {
        // 1. Filter it out of the master routines array
        this.routines = this.routines.filter(r => r.id !== routineId);
        
        // 2. Feed the ID to the Invisible Trash Bin for the Sync Engine
        if (typeof this.trackDeletedId === 'function') {
            this.trackDeletedId(routineId); // <-- This is what was crashing it! (It was 'taskId')
        }

        // 3. Save the updated routines list to local storage
        import('./storage.js').then(module => {
            module.Storage.set('master_routines', this.routines);
        });
    },

    deleteTask(taskId) {
        this.tasks = this.tasks.filter(t => t.id !== taskId);
        this.trackDeletedId(taskId); // <-- NEW!
        import('./storage.js').then(module => {
            module.Storage.set(`tasks_${this.currentDateKey}`, this.tasks);
        });
    },
    
    toggleTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const currentStatus = task.status || (task.completed ? 'completed' : 'pending');

        if (currentStatus === 'pending') {
            this.tasks.forEach(t => {
                if (t.status === 'active') {
                    t.status = 'pending';
                    t.completed = false;
                }
            });
            task.status = 'active';
            task.completed = false;
        } else if (currentStatus === 'active') {
            task.status = 'completed';
            task.completed = true;
        } else if (currentStatus === 'completed') {
            task.status = 'pending';
            task.completed = false;
        }

        import('./storage.js').then(module => {
            module.Storage.set(`tasks_${this.currentDateKey}`, this.tasks);
        });
    },

    skipRoutineForDate(routineId, dateKey) {
        if (!this.routineOverrides[dateKey]) {
            this.routineOverrides[dateKey] = [];
        }
        if (!this.routineOverrides[dateKey].includes(routineId)) {
            this.routineOverrides[dateKey].push(routineId);
            import('./storage.js').then(module => {
                module.Storage.set('routine_overrides', this.routineOverrides);
            });
        }
    },

    toggleRoutineCompletion(routineId, dateKey) {
        if (!this.routineCompletions[dateKey]) {
            this.routineCompletions[dateKey] = [];
        }
        
        const arr = this.routineCompletions[dateKey];
        const index = arr.indexOf(routineId);
        
        if (index > -1) {
            arr.splice(index, 1); // If already collapsed, un-collapse it
        } else {
            arr.push(routineId); // Collapse it for today
        }
        
        import('./storage.js').then(module => {
            module.Storage.set('routine_completions', this.routineCompletions);
        });
    },

    // ==========================================
    // PHASE 4: SETTINGS & SYNC PREP
    // ==========================================
    
    updateInboxLimit(newLimit) {
        this.inboxLimit = newLimit;
        import('./storage.js').then(module => {
            module.Storage.set('settings_inboxLimit', this.inboxLimit);
        });
    },

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        import('./storage.js').then(module => {
            module.Storage.set('settings_soundEnabled', this.soundEnabled);
        });
        return this.soundEnabled;
    },

    trackDeletedId(id) {
        if (!this.deletedIds.includes(id)) {
            this.deletedIds.push(id);
            import('./storage.js').then(module => {
                module.Storage.set('deleted_ids', this.deletedIds);
            });
        }
    },

    factoryReset() {
        // Find our specific prefix (slate_app_) and wipe ONLY our data
        import('./storage.js').then(module => {
            const prefix = module.Storage.PREFIX;
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    localStorage.removeItem(key);
                }
            }
            // Hard refresh the page to start fresh
            window.location.reload();
        });
    },

    exportData() {
        const backup = {};
        import('./storage.js').then(module => {
            const prefix = module.Storage.PREFIX;
            // 1. Gather every single piece of Slate data from the browser
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    const originalKey = key.substring(prefix.length);
                    backup[originalKey] = module.Storage.get(originalKey);
                }
            }
            
            // --- NEW: Generate Dynamic Filename with Date & 24h Time ---
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const hr = String(now.getHours()).padStart(2, '0'); // 24h format
            const min = String(now.getMinutes()).padStart(2, '0');
            
            const dynamicFileName = `slate_backup_${yyyy}-${mm}-${dd}_${hr}${min}.json`;
            // -----------------------------------------------------------

            // 2. Package it into a downloadable JSON file
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            
            // 3. Attach the beautiful new dynamic filename
            downloadAnchorNode.setAttribute("download", dynamicFileName); 
            
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        });
    },

    importData(importedData) {
        import('./storage.js').then(module => {
            // 1. MERGE THE TRASH BINS FIRST
            const localDeleted = this.deletedIds;
            const importedDeleted = importedData['deleted_ids'] || [];
            // Combine both lists and remove duplicates using a Set
            const combinedDeleted = [...new Set([...localDeleted, ...importedDeleted])]; 
            
            this.deletedIds = combinedDeleted;
            module.Storage.set('deleted_ids', this.deletedIds);

            const isKilled = (id) => combinedDeleted.includes(id);

            // 2. ITERATE THROUGH IMPORTED DATA
            for (const key in importedData) {
                if (key === 'deleted_ids') continue; // Already handled

                // A. Handle Simple Settings (Imported wins)
                if (key === 'settings_inboxLimit') {
                    module.Storage.set(key, importedData[key]);
                    continue;
                }
                
                // B. Handle Dictionaries (Subtasks & Routine Overrides)
                if (key === 'routine_overrides' || key === 'subtask_states') {
                    const localObj = module.Storage.get(key, {});
                    const importedObj = importedData[key];
                    // Merges them. If there's a conflict, imported wins.
                    const mergedObj = { ...localObj, ...importedObj };
                    module.Storage.set(key, mergedObj);
                    continue;
                }

                // C. Handle Arrays (Tasks, Routines, Inbox)
                const localArray = module.Storage.get(key, []);
                const importedArray = importedData[key];
                
                if (Array.isArray(importedArray)) {
                    let mergedArray = [...localArray];
                    
                    importedArray.forEach(importedItem => {
                        const localIndex = mergedArray.findIndex(item => item.id === importedItem.id);
                        if (localIndex > -1) {
                            // Conflict! Imported file overwrites the local item.
                            mergedArray[localIndex] = importedItem;
                        } else {
                            // It's a brand new item from the other device. Add it.
                            mergedArray.push(importedItem);
                        }
                    });

                    // D. THE ZOMBIE KILLER: Filter out anything present in the combined trash bin
                    mergedArray = mergedArray.filter(item => !isKilled(item.id));
                    
                    module.Storage.set(key, mergedArray);
                }
            }

            // 3. SHOW TOAST AND REBOOT
            const toast = document.getElementById('toastNotification');
            const toastMsg = document.getElementById('toastMessage');
            if (toast && toastMsg) {
                toastMsg.textContent = "Data merged successfully! 🔄";
                toast.classList.add('show');
            }
            
            // Wait 1.5 seconds so you can read the toast, then reboot to lock in the clean data!
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        });
    },

    // ==========================================
    // PHASE 6: THE SILENT GARBAGE COLLECTOR
    // ==========================================
    runGarbageCollector() {
        import('./storage.js').then(module => {
            const prefix = module.Storage.PREFIX;
            const now = Date.now();
            const retentionDays = 120; // Easy to change later!
            const cutoffMs = retentionDays * 24 * 60 * 60 * 1000;
            const cutoffTime = now - cutoffMs;

            // 1. Sweep old Daily Task Files
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix + 'tasks_')) {
                    const dateString = key.replace(prefix + 'tasks_', ''); // isolates "YYYY-MM-DD"
                    const fileDate = new Date(dateString).getTime();
                    
                    if (fileDate < cutoffTime) {
                        localStorage.removeItem(key);
                        console.log(`Slate Sweeper: Deleted old file ${dateString}`);
                    }
                }
            }

            // 2. Prune the Invisible Trash Bin (deleted_ids)
            // Your IDs look like "t_1710000000000". We just extract those numbers!
            const localDeleted = module.Storage.get('deleted_ids', []);
            if (localDeleted.length > 0) {
                const cleanedDeleted = localDeleted.filter(id => {
                    const parts = id.split('_');
                    if (parts.length > 1) {
                        const timestamp = parseInt(parts[1], 10);
                        return timestamp > cutoffTime; // Keep it ONLY if it's newer than 90 days
                    }
                    return false;
                });
                
                // If we removed old junk, save the newly cleaned trash bin
                if (cleanedDeleted.length !== localDeleted.length) {
                    module.Storage.set('deleted_ids', cleanedDeleted);
                }
            }
        });
    }


};  // END