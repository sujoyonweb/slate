// js/events.js
import { State } from './state.js';
import { UI } from './ui.js';

let activeMenuBlockId = null;
let activeMenuBlockType = null;
let editingBlockId = null;
let editingBlockType = null;

// --- NEW: The Premium Acoustic Audio Engine ---
const AudioEngine = {
    ctx: null,
    
    // 👇 COMMENT TO CHANGE VOLUME: Set from 0.0 (mute) to 1.0 (max loudness)
    masterVolume: 1.0, 

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
    },
    playTick() {
        if (!State.soundEnabled) return; // NEW: Abort if sound is muted
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.03); 
        
        // Applies the masterVolume multiplier to the base volume (0.3)
        gain.gain.setValueAtTime(0.3 * this.masterVolume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.03);
    },
    playChime() {
        if (!State.soundEnabled) return; // NEW: Abort if sound is muted
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        
        const playNote = (freq, startTime, duration) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            // Applies the masterVolume multiplier to the base volume (0.15)
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.15 * this.masterVolume, startTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration);
        };
        
        const now = this.ctx.currentTime;
        playNote(587.33, now, 0.5);        // D5 Note
        playNote(880.00, now + 0.12, 0.8); // A5 Note
    }
};

export const Events = {
    currentView: 'viewTimeline',
    isAnimating: false,

    init() {
        this.bindPillNavigation();
        this.bindDateClicks();
        this.bindModalLogic();
        this.bindTimelineActions();
        this.bindRoutineActions();
        this.bindHeaderScroll();
        this.bindGestures(); // <-- NEW: Turn on the swipe engine
    },

    bindHeaderScroll() {
        const header = document.getElementById('appHeader');
        if (!header) return;

        // This simply checks: Are we scrolled past 10px? 
        const handleScroll = (e) => {
            if (e.target.scrollTop > 10) {
                header.classList.add('scrolled'); // Glide up to 8px
            } else {
                header.classList.remove('scrolled'); // Glide back down to 20px
            }
        };

        const viewTimeline = document.getElementById('viewTimeline');
        const viewRoutines = document.getElementById('viewRoutines');

        // { passive: true } makes sure scrolling stays buttery smooth
        if (viewTimeline) viewTimeline.addEventListener('scroll', handleScroll, { passive: true });
        if (viewRoutines) viewRoutines.addEventListener('scroll', handleScroll, { passive: true });
    },

    bindPillNavigation() {
        const navPill = document.getElementById('navPill');
        if (!navPill) return;

        navPill.addEventListener('click', (e) => {
            const btn = e.target.closest('.pill-btn');
            if (!btn || this.isAnimating) return;

            const targetViewId = btn.getAttribute('data-target');
            if (this.currentView === targetViewId) return;

            this.isAnimating = true;

            document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const indicator = document.getElementById('pillIndicator');
            const isMovingRight = targetViewId === 'viewRoutines';
            if (indicator) indicator.style.left = isMovingRight ? '76%' : '24%';

            const currentEl = document.getElementById(this.currentView);
            const targetEl = document.getElementById(targetViewId);

            currentEl.className = `view active ${isMovingRight ? 'slide-out-left' : 'slide-out-right'}`;

            setTimeout(() => {
                currentEl.className = 'view hidden';
                targetEl.className = `view active ${isMovingRight ? 'slide-in-right' : 'slide-in-left'}`;
                this.currentView = targetViewId;
                setTimeout(() => { this.isAnimating = false; }, 300);
            }, 250); 
        });
    },

    bindDateClicks() {
        const viewTimeline = document.getElementById('viewTimeline');
        if (!viewTimeline) return;

        viewTimeline.addEventListener('click', (e) => {
            const dateItem = e.target.closest('.date-item');
            if (!dateItem) return;

            if (navigator.vibrate) navigator.vibrate(10); 
            const clickedKey = dateItem.getAttribute('data-key');
            if (State.changeDate(clickedKey)) {
                UI.renderDateStrip();
                UI.renderTimeline(true); // <-- Pass true so it cascades when swapping dates!
            }
        });
    },

    bindModalLogic() {
        const fabMain = document.getElementById('btnMainFab');
        const entryModal = document.getElementById('entryModal');
        
        const inputHour = document.getElementById('inputHour');
        const inputMinute = document.getElementById('inputMinute');
        const inputTitle = document.getElementById('inputTitle');
        const btnAm = document.getElementById('btnAm');
        const btnPm = document.getElementById('btnPm');
        const inputSubtasks = document.getElementById('inputSubtasks');
        const btnSaveEntry = document.getElementById('btnSaveEntry');
        
        const sectionSubtasks = document.querySelector('.subtask-section');
        const sectionRoutineDays = document.querySelector('.routine-days-section');
        const dayToggles = document.querySelectorAll('.day-toggle');
        const btnEveryday = document.getElementById('btnEveryday');
        const btnWorkdays = document.getElementById('btnWorkdays');

        if (fabMain && entryModal) {
            fabMain.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate(15);
                editingBlockId = null;
                editingBlockType = null;
                document.getElementById('btnSaveEntry').innerText = "Schedule Block";
                
                if (this.currentView === 'viewTimeline') {
                    inputTitle.placeholder = "e.g., Deep Study Session";
                    if (sectionSubtasks) sectionSubtasks.style.display = 'flex';
                    if (sectionRoutineDays) sectionRoutineDays.style.display = 'none';
                } else {
                    inputTitle.placeholder = "e.g., Morning Workout";
                    if (sectionSubtasks) sectionSubtasks.style.display = 'flex'; // FIX: Keeps subtasks visible for routines!
                    if (sectionRoutineDays) sectionRoutineDays.style.display = 'block';
                }
                
                entryModal.classList.add('active');
            });
        }

        if (entryModal) {
            entryModal.addEventListener('click', (e) => {
                if (e.target === entryModal) entryModal.classList.remove('active');
            });
        }
        
        const updateEverydayButton = () => {
            const activeDays = Array.from(document.querySelectorAll('.day-toggle.active')).map(b => parseInt(b.dataset.day, 10));
            
            // Check Everyday
            if (activeDays.length === 7) btnEveryday.classList.add('active');
            else btnEveryday.classList.remove('active');
            
            // Check Workdays (Exactly Mon-Fri, no Sun/Sat)
            const isWorkdays = activeDays.length === 5 && !activeDays.includes(0) && !activeDays.includes(6);
            if (btnWorkdays) btnWorkdays.classList.toggle('active', isWorkdays);
        };

        dayToggles.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (navigator.vibrate) navigator.vibrate(10);
                btn.classList.toggle('active');
                updateEverydayButton();
            });
        });

        if (btnEveryday) {
            btnEveryday.addEventListener('click', (e) => {
                e.preventDefault();
                if (navigator.vibrate) navigator.vibrate(15);
                if (btnEveryday.classList.contains('active')) {
                    btnEveryday.classList.remove('active');
                    dayToggles.forEach(b => b.classList.remove('active'));
                } else {
                    btnEveryday.classList.add('active');
                    dayToggles.forEach(b => b.classList.add('active'));
                }
                updateEverydayButton();
            });
        }

        if (btnWorkdays) {
            btnWorkdays.addEventListener('click', (e) => {
                e.preventDefault();
                if (navigator.vibrate) navigator.vibrate(15);
                
                // NEW: If it's already active, clicking it again clears everything
                if (btnWorkdays.classList.contains('active')) {
                    btnWorkdays.classList.remove('active');
                    dayToggles.forEach(b => b.classList.remove('active'));
                } else {
                    // Otherwise, turn on Mon-Fri and turn off Sun/Sat
                    dayToggles.forEach(b => {
                        const d = parseInt(b.dataset.day, 10);
                        if (d >= 1 && d <= 5) b.classList.add('active'); // Mon-Fri
                        else b.classList.remove('active'); // Sun, Sat
                    });
                }
                
                updateEverydayButton(); // Keeps the UI classes perfectly in sync
            });
        }

        const setAMPM = (val) => {
            if (navigator.vibrate) navigator.vibrate(10);
            if (val === 'AM') { btnAm.classList.add('active'); btnPm.classList.remove('active'); }
            else { btnPm.classList.add('active'); btnAm.classList.remove('active'); }
        };
        if (btnAm) btnAm.addEventListener('click', () => setAMPM('AM'));
        if (btnPm) btnPm.addEventListener('click', () => setAMPM('PM'));

        const formatTime = (el, max) => {
            let val = parseInt(el.value, 10);
            if (isNaN(val)) el.value = '';
            else {
                if (max === 12 && val === 0) val = 12; 
                if (val > max) val = max;
                el.value = val.toString().padStart(2, '0');
            }
        };
        if (inputHour && inputMinute) {
            inputHour.addEventListener('input', (e) => { if (e.target.value.length === 2) inputMinute.focus(); });
            inputHour.addEventListener('blur', () => formatTime(inputHour, 12));
            inputMinute.addEventListener('blur', () => formatTime(inputMinute, 59));
        }

        if (inputSubtasks) {
            inputSubtasks.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const start = inputSubtasks.selectionStart;
                    const val = inputSubtasks.value;
                    const insertion = "\n▢ ";
                    inputSubtasks.value = val.substring(0, start) + insertion + val.substring(inputSubtasks.selectionEnd);
                    inputSubtasks.selectionStart = inputSubtasks.selectionEnd = start + insertion.length;
                }
            });
            inputSubtasks.addEventListener('focus', () => {
                if (inputSubtasks.value.trim() === '') inputSubtasks.value = '▢ ';
            });
        }

        if (btnSaveEntry) {
            btnSaveEntry.addEventListener('click', () => {
                const hr = inputHour.value;
                const min = inputMinute.value;
                const title = inputTitle.value.trim();

                if (!hr || !min || !title) {
                    if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
                    inputTitle.focus();
                    return;
                }

                let h = parseInt(hr, 10);
                const ampm = document.querySelector('.ampm-btn.active').innerText;
                if (ampm === 'PM' && h !== 12) h += 12;
                if (ampm === 'AM' && h === 12) h = 0;
                const time24 = `${h.toString().padStart(2, '0')}:${min.padStart(2, '0')}`;

                if (this.currentView === 'viewTimeline') {
                    const subtasksVal = inputSubtasks.value;
                    const subtasksArray = subtasksVal.split('\n').map(s => s.replace(/^▢\s*/, '').trim()).filter(s => s !== '');
                    
                    if (editingBlockId && editingBlockType === 'task') {
                        State.updateTask(editingBlockId, time24, title, subtasksArray);
                    } else if (editingBlockId && editingBlockType === 'inbox') {
                        State.addTask(time24, title, subtasksArray);
                        State.deleteInboxItem(editingBlockId);
                    } else {
                        State.addTask(time24, title, subtasksArray);
                    }
                } else {
                    const activeDays = Array.from(document.querySelectorAll('.day-toggle.active')).map(b => parseInt(b.dataset.day, 10));
                    
                    const subtasksVal = inputSubtasks.value;
                    const subtasksArray = subtasksVal.split('\n').map(s => s.replace(/^▢\s*/, '').trim()).filter(s => s !== '');

                    if (!editingBlockId && State.hasRoutineOverlap(time24, activeDays)) {
                        if (navigator.vibrate) navigator.vibrate([30, 50, 30]); 
                        const modalSurface = document.querySelector('.modal-surface');
                        modalSurface.classList.add('shake');
                        setTimeout(() => modalSurface.classList.remove('shake'), 400); 
                        UI.showToast("Time slot already taken by another routine.");
                        return; 
                    }

                    if (editingBlockId && editingBlockType === 'routine') {
                        State.updateRoutine(editingBlockId, time24, title, activeDays, subtasksArray); 
                    } else {
                        State.addRoutine(time24, title, activeDays, subtasksArray); 
                    }
                    UI.renderRoutines(); 
                }

                UI.renderTimeline();

                if (navigator.vibrate) navigator.vibrate(15);
                entryModal.classList.remove('active');
                inputHour.value = ''; inputMinute.value = ''; inputTitle.value = ''; inputSubtasks.value = '';
                
                if (btnEveryday) btnEveryday.classList.add('active');
                dayToggles.forEach(b => b.classList.add('active'));
                updateEverydayButton(); // Resets the Workdays button state too
            });
        }

        // --- ARCHIVE MODAL LOGIC ---
        const archiveModal = document.getElementById('archiveModal');
        if (archiveModal) {
            archiveModal.addEventListener('click', (e) => {
                if (e.target === archiveModal) {
                    archiveModal.classList.remove('active');
                    return;
                }

                const btnDelete = e.target.closest('.btn-inbox-delete');
                if (btnDelete) {
                    if (navigator.vibrate) navigator.vibrate([20, 30]);
                    const inboxId = btnDelete.closest('.inbox-item').getAttribute('data-id');
                    State.deleteInboxItem(inboxId);
                    UI.renderInboxArchive(); // Redraws the modal
                    UI.renderTimeline();     // Redraws the background
                    return;
                }

                const btnSchedule = e.target.closest('.btn-inbox-schedule');
                if (btnSchedule) {
                    if (navigator.vibrate) navigator.vibrate(10);
                    const inboxId = btnSchedule.closest('.inbox-item').getAttribute('data-id');
                    const itemToEdit = State.inbox.find(i => i.id == inboxId);

                    if (itemToEdit) {
                        editingBlockId = inboxId;
                        editingBlockType = 'inbox'; 
                        archiveModal.classList.remove('active'); // Close archive
                        
                        document.getElementById('inputHour').value = '';
                        document.getElementById('inputMinute').value = '';
                        document.getElementById('inputTitle').value = itemToEdit.title;
                        const sectionSubtasks = document.querySelector('.subtask-section');
                        const sectionRoutineDays = document.querySelector('.routine-days-section');
                        if (sectionSubtasks) sectionSubtasks.style.display = 'flex';
                        if (sectionRoutineDays) sectionRoutineDays.style.display = 'none';
                        const subInput = document.getElementById('inputSubtasks');
                        if (itemToEdit.subtasks && itemToEdit.subtasks.length > 0) {
                            subInput.value = itemToEdit.subtasks.map(s => `▢ ${s}`).join('\n');
                        } else { subInput.value = ''; }
                        document.getElementById('btnSaveEntry').innerText = "Schedule Block";
                        document.getElementById('entryModal').classList.add('active');
                    }
                }
            });
        }

        // --- SETTINGS MODAL LOGIC ---
        const settingsModal = document.getElementById('settingsModal');
        const btnOpenSettings = document.getElementById('btnOpenSettings');

        if (btnOpenSettings && settingsModal) {
            btnOpenSettings.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate(10);
                
                // Load the current Inbox Limit
                const textInboxLimit = document.getElementById('textInboxLimit');
                if (textInboxLimit) textInboxLimit.innerText = State.inboxLimit;
                
                // NEW: Load the current Sound Toggle State
                const soundToggleUI = document.getElementById('soundToggleUI');
                if (soundToggleUI) {
                    if (State.soundEnabled) soundToggleUI.classList.add('active');
                    else soundToggleUI.classList.remove('active');
                }
                
                settingsModal.classList.add('active');
            });
        }

        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    settingsModal.classList.remove('active');
                }
            });
        }

        // --- 5. Sound Toggle Logic ---
        const btnToggleSound = document.getElementById('btnToggleSound');
        const soundToggleUI = document.getElementById('soundToggleUI');

        if (btnToggleSound && soundToggleUI) {
            btnToggleSound.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate(10);
                
                // This flips the state in the database and returns the new value (true/false)
                const isNowEnabled = State.toggleSound();
                
                // Update the visual UI based on the new state
                if (isNowEnabled) {
                    soundToggleUI.classList.add('active'); // Turn green
                    AudioEngine.playTick(); // Play a tiny confirmation tick
                } else {
                    soundToggleUI.classList.remove('active'); // Turn grey
                }
            });
        }

        // --- 1. Hardware Stepper (Inbox Limit) ---
        const btnInboxMinus = document.getElementById('btnInboxMinus');
        const btnInboxPlus = document.getElementById('btnInboxPlus');
        const textInboxLimit = document.getElementById('textInboxLimit');

        // A safe helper function to change the number
        const changeInboxLimit = (newVal) => {
            if (newVal < 1) newVal = 1;   // Floor safety (cannot go below 1)
            if (newVal > 99) newVal = 99; // Ceiling safety (cannot go above 99)
            
            State.updateInboxLimit(newVal);            // Saves it to the database
            if (textInboxLimit) textInboxLimit.innerText = newVal; // Updates the UI instantly
            
            if (navigator.vibrate) navigator.vibrate(10); // Hardware mechanical feel
            UI.renderTimeline(); // Redraws inbox on the main page to reflect new limit!
        };

        if (btnInboxMinus) {
            btnInboxMinus.addEventListener('click', () => {
                changeInboxLimit(State.inboxLimit - 1);
            });
        }

        if (btnInboxPlus) {
            btnInboxPlus.addEventListener('click', () => {
                changeInboxLimit(State.inboxLimit + 1);
            });
        }

        // Factory Reset
        // --- 2. Custom Factory Reset Modal ---
        const btnTriggerReset = document.getElementById('btnTriggerReset');
        const resetModal = document.getElementById('resetModal');
        const btnCancelReset = document.getElementById('btnCancelReset');
        const btnConfirmReset = document.getElementById('btnConfirmReset');

        // 1. Open the Custom Modal
        if (btnTriggerReset && resetModal) {
            btnTriggerReset.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate([30, 50, 30]); // Deep warning vibration
                resetModal.classList.add('active'); 
            });
        }

        // 2. Safe Escape Route (Cancel)
        if (btnCancelReset && resetModal) {
            btnCancelReset.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate(10);
                resetModal.classList.remove('active'); 
            });
        }

        // 3. Execute the Wipe
        if (btnConfirmReset) {
            btnConfirmReset.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate([50, 100, 50]); // Aggressive execution vibration
                btnConfirmReset.innerText = "Wiping..."; // Tiny UI feedback
                btnConfirmReset.style.opacity = "0.5";
                
                setTimeout(() => {
                    State.factoryReset(); // The engine does the rest!
                }, 250); // Slight delay so the user sees the button change before the page reloads
            });
        }

        // --- 3. Export Data ---
        const btnExportData = document.getElementById('btnExportData');
        if (btnExportData) {
            btnExportData.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate(10);
                State.exportData();
                UI.showToast("Backup exported successfully.");
            });
        }

        // --- 4. Advanced Sync Engine (Click, Drop, Paste) ---
        const btnImportData = document.getElementById('btnImportData');
        const fileImport = document.getElementById('fileImport');
        const syncDropzone = document.getElementById('syncDropzone');
        const settingsModalEl = document.getElementById('settingsModal');

        // THE SAFE HELPER: All 3 methods send their file here to be processed
        const processImportFile = (file) => {
            if (!file) return;
            
            // Safety Check: Ensure it's actually a JSON file
            if (file.type !== "application/json" && !file.name.endsWith('.json')) {
                UI.showToast("Please use a valid slate_backup.json file.");
                return;
            }

            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const jsonData = JSON.parse(event.target.result);
                    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
                    State.importData(jsonData); // Hands off to your rock-solid engine!
                } catch (err) {
                    alert("Invalid backup file. It might be corrupted.");
                    console.error(err);
                }
            };
            reader.readAsText(file);
        };

        // METHOD 1: The Standard Click-to-Select
        if (btnImportData && fileImport) {
            btnImportData.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate(10);
                fileImport.click();
            });

            fileImport.addEventListener('change', (e) => {
                processImportFile(e.target.files[0]);
                e.target.value = ''; // Resets the input so you can select it again if needed
            });
        }

        // METHOD 2: The Native Drag & Drop
        if (syncDropzone) {
            // Stop the browser from accidentally opening the file in a new tab
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                syncDropzone.addEventListener(eventName, (e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                }, false);
            });

            // Turn on the green dashed border when a file hovers over it
            ['dragenter', 'dragover'].forEach(eventName => {
                syncDropzone.addEventListener(eventName, () => {
                    syncDropzone.classList.add('drag-over'); 
                }, false);
            });

            // Turn off the green border when the file leaves or drops
            ['dragleave', 'drop'].forEach(eventName => {
                syncDropzone.addEventListener(eventName, () => {
                    syncDropzone.classList.remove('drag-over');
                }, false);
            });

            // Actually grab the file when dropped
            syncDropzone.addEventListener('drop', (e) => {
                const file = e.dataTransfer.files[0];
                processImportFile(file);
            });
        }

        // METHOD 3: The Magical "Paste" Listener
        if (settingsModalEl) {
            settingsModalEl.addEventListener('paste', (e) => {
                // Only intercept paste if the settings modal is actually open
                if (!settingsModalEl.classList.contains('active')) return;

                // Check if the user pasted a physical file from their clipboard
                if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
                    e.preventDefault();
                    processImportFile(e.clipboardData.files[0]);
                }
            });
        }

    },

    bindTimelineActions() {
        const viewTimeline = document.getElementById('viewTimeline');
        if (!viewTimeline) return;

        const actionOverlay = document.getElementById('actionMenuOverlay');
        const actionSheet = document.getElementById('actionMenuSheet');
        const btnMenuDelete = document.getElementById('btnMenuDelete');

        if (actionOverlay) {
            actionOverlay.addEventListener('click', () => {
                actionOverlay.classList.remove('show');
                actionSheet.classList.remove('show');
                activeMenuBlockId = null;
            });
        }

        const btnMenuEdit = document.getElementById('btnMenuEdit');
        if (btnMenuEdit) {
            btnMenuEdit.addEventListener('click', () => {
                if (!activeMenuBlockId) return;
                
                editingBlockId = activeMenuBlockId;
                editingBlockType = activeMenuBlockType;

                let itemToEdit = editingBlockType === 'task' 
                    ? State.tasks.find(t => t.id == editingBlockId)
                    : State.routines.find(r => r.id == editingBlockId);

                if (itemToEdit) {
                    let [hourStr, minStr] = itemToEdit.time.split(':');
                    let h = parseInt(hourStr, 10);
                    let ampm = h >= 12 ? 'PM' : 'AM';
                    if (h === 0) h = 12;
                    if (h > 12) h -= 12;
                    
                    document.getElementById('inputHour').value = h.toString().padStart(2, '0');
                    document.getElementById('inputMinute').value = minStr;
                    
                    if (ampm === 'AM') {
                        document.getElementById('btnAm').classList.add('active');
                        document.getElementById('btnPm').classList.remove('active');
                    } else {
                        document.getElementById('btnAm').classList.remove('active');
                        document.getElementById('btnPm').classList.add('active');
                    }

                    document.getElementById('inputTitle').value = itemToEdit.title;

                    const sectionSubtasks = document.querySelector('.subtask-section');
                    const sectionRoutineDays = document.querySelector('.routine-days-section');

                    if (editingBlockType === 'task') {
                        if (sectionSubtasks) sectionSubtasks.style.display = 'flex';
                        if (sectionRoutineDays) sectionRoutineDays.style.display = 'none';
                        
                        const subInput = document.getElementById('inputSubtasks');
                        if (itemToEdit.subtasks && itemToEdit.subtasks.length > 0) {
                            subInput.value = itemToEdit.subtasks.map(s => `▢ ${s}`).join('\n');
                        } else {
                            subInput.value = '';
                        }
                    } else {
                        // FIX: Logic for populating and showing everything for an edited routine
                        if (sectionSubtasks) sectionSubtasks.style.display = 'flex'; 
                        if (sectionRoutineDays) sectionRoutineDays.style.display = 'block';
                        
                        // Populate Routine Subtasks
                        const subInput = document.getElementById('inputSubtasks');
                        if (itemToEdit.subtasks && itemToEdit.subtasks.length > 0) {
                            subInput.value = itemToEdit.subtasks.map(s => `▢ ${s}`).join('\n');
                        } else {
                            subInput.value = '';
                        }
                        
                        const dayToggles = document.querySelectorAll('.day-toggle');
                        dayToggles.forEach(btn => {
                            if (itemToEdit.days.includes(parseInt(btn.dataset.day, 10))) btn.classList.add('active');
                            else btn.classList.remove('active');
                        });
                        
                        // Manually trigger the Workdays/Everyday highlight check based on the routine being edited
                        const activeCount = itemToEdit.days.length;
                        const isWorkdays = activeCount === 5 && !itemToEdit.days.includes(0) && !itemToEdit.days.includes(6);
                        document.getElementById('btnEveryday').classList.toggle('active', activeCount === 7);
                        if(document.getElementById('btnWorkdays')) document.getElementById('btnWorkdays').classList.toggle('active', isWorkdays);
                    }

                    document.getElementById('btnSaveEntry').innerText = "Update Block";
                    document.getElementById('entryModal').classList.add('active');
                }
                
                actionOverlay.classList.remove('show');
                actionSheet.classList.remove('show');
            });
        }

        if (btnMenuDelete) {
            btnMenuDelete.addEventListener('click', () => {
                if (!activeMenuBlockId) return;
                
                // 1. Find the block on the screen and animate it sliding left
                const blockEl = document.querySelector(`.timeline-node-block[data-id="${activeMenuBlockId}"]`);
                if (blockEl) blockEl.classList.add('animate-delete-left');
                
                // Close the menu immediately so it doesn't block the view
                actionOverlay.classList.remove('show');
                actionSheet.classList.remove('show');
                if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
                
                // 2. Wait 300ms for it to slide out, THEN delete it
                setTimeout(() => {
                    const isRoutinesPage = document.getElementById('viewRoutines').classList.contains('active');
                    if (activeMenuBlockType === 'task') {
                        State.deleteTask(activeMenuBlockId); 
                    } else if (activeMenuBlockType === 'routine') {
                        if (isRoutinesPage) State.deleteRoutine(activeMenuBlockId); 
                        else State.skipRoutineForDate(activeMenuBlockId, State.currentDateKey);
                    }
                    
                    UI.renderTimeline();
                    if (isRoutinesPage) UI.renderRoutines(); 
                    UI.showToast("Block removed.");
                }, 300);
            });
        }

        const btnMenuPushTomorrow = document.getElementById('btnMenuPushTomorrow');
        if (btnMenuPushTomorrow) {
            btnMenuPushTomorrow.addEventListener('click', () => {
                if (!activeMenuBlockId || activeMenuBlockType !== 'task') return;

                // 1. Slide it to the RIGHT to imply moving to the future
                const blockEl = document.querySelector(`.timeline-node-block[data-id="${activeMenuBlockId}"]`);
                if (blockEl) blockEl.classList.add('animate-push-right');

                actionOverlay.classList.remove('show');
                actionSheet.classList.remove('show');
                if (navigator.vibrate) navigator.vibrate([15, 30]); 

                // 2. Wait 300ms, then move it
                setTimeout(() => {
                    const taskIndex = State.tasks.findIndex(t => t.id == activeMenuBlockId);
                    if (taskIndex === -1) return;
                    const taskToMove = State.tasks.splice(taskIndex, 1)[0]; 

                    const [year, month, day] = State.currentDateKey.split('-').map(Number);
                    const tmrwDate = new Date(year, month - 1, day + 1);
                    const tmrwKey = `${tmrwDate.getFullYear()}-${String(tmrwDate.getMonth() + 1).padStart(2, '0')}-${String(tmrwDate.getDate()).padStart(2, '0')}`;

                    import('./storage.js').then(module => {
                        module.Storage.set(`tasks_${State.currentDateKey}`, State.tasks);
                        const tmrwTasks = module.Storage.get(`tasks_${tmrwKey}`, []);
                        tmrwTasks.push(taskToMove);
                        module.Storage.set(`tasks_${tmrwKey}`, tmrwTasks);
                        
                        UI.renderTimeline(); 
                        UI.showToast("Pushed to tomorrow.");
                    });
                }, 300);
            });
        }

        const btnMenuPushUnscheduled = document.getElementById('btnMenuPushUnscheduled');
        if (btnMenuPushUnscheduled) {
            btnMenuPushUnscheduled.addEventListener('click', () => {
                if (!activeMenuBlockId || activeMenuBlockType !== 'task') return;

                // --- NEW: Check limit BEFORE removing from timeline! ---
                if (State.inbox.length >= State.inboxLimit) {
                    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
                    actionOverlay.classList.remove('show');
                    actionSheet.classList.remove('show');
                    UI.showToast(`Inbox full (${State.inboxLimit}/${State.inboxLimit}). Cannot move task.`);
                    return;
                }

                const taskIndex = State.tasks.findIndex(t => t.id == activeMenuBlockId);
                if (taskIndex === -1) return;
                const taskToMove = State.tasks.splice(taskIndex, 1)[0]; 

                State.addInboxItem(taskToMove.title, taskToMove.subtasks);
                import('./storage.js').then(module => {
                    module.Storage.set(`tasks_${State.currentDateKey}`, State.tasks);
                });

                if (navigator.vibrate) navigator.vibrate([15, 30]); 
                UI.renderTimeline(); 
                
                actionOverlay.classList.remove('show');
                actionSheet.classList.remove('show');
                UI.showToast("Moved to Inbox.");
            });
        }

        viewTimeline.addEventListener('keydown', (e) => {
            if (e.target.id === 'inputQuickInbox' && e.key === 'Enter') {
                e.preventDefault();
                const val = e.target.value.trim();
                if (val) {
                    const success = State.addInboxItem(val, []);
                    if (!success) { // Failed due to 15 limit!
                        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
                        e.target.closest('.inbox-input-wrapper').classList.add('shake');
                        setTimeout(() => e.target.closest('.inbox-input-wrapper').classList.remove('shake'), 400);
                        UI.showToast(`Inbox full (${State.inboxLimit}/${State.inboxLimit}). Make some room.`);
                        return;
                    }
                    if (navigator.vibrate) navigator.vibrate(10);
                    UI.renderTimeline();
                    setTimeout(() => {
                        const newInp = document.getElementById('inputQuickInbox');
                        if(newInp) newInp.focus();
                    }, 50);
                }
            }
        });

        viewTimeline.addEventListener('click', (e) => {
            
            // 1. Open Archive Modal
            const btnArchive = e.target.closest('#btnViewArchive');
            if (btnArchive) {
                if (navigator.vibrate) navigator.vibrate(10);
                UI.renderInboxArchive();
                document.getElementById('archiveModal').classList.add('active');
                return;
            }

            // 2. Delete Inbox Item
            const btnDeleteInbox = e.target.closest('.btn-inbox-delete');
            if (btnDeleteInbox) {
                e.stopPropagation();
                if (navigator.vibrate) navigator.vibrate([20, 30]);
                
                // 1. Find the inbox item and trigger the slide-left animation
                const inboxItem = btnDeleteInbox.closest('.inbox-item');
                const inboxId = inboxItem.getAttribute('data-id');
                inboxItem.classList.add('animate-delete-left');
                
                // 2. Wait 300ms for the animation and height collapse, THEN remove data
                setTimeout(() => {
                    State.deleteInboxItem(inboxId);
                    UI.renderTimeline();
                }, 300);
                return;
            }

            // 3. Schedule Inbox Item
            const btnScheduleInbox = e.target.closest('.btn-inbox-schedule');
            if (btnScheduleInbox) {
                e.stopPropagation();
                if (navigator.vibrate) navigator.vibrate(10);
                const inboxId = btnScheduleInbox.closest('.inbox-item').getAttribute('data-id');
                const itemToEdit = State.inbox.find(i => i.id == inboxId);

                if (itemToEdit) {
                    editingBlockId = inboxId;
                    editingBlockType = 'inbox'; 
                    document.getElementById('inputHour').value = '';
                    document.getElementById('inputMinute').value = '';
                    document.getElementById('inputTitle').value = itemToEdit.title;
                    const sectionSubtasks = document.querySelector('.subtask-section');
                    const sectionRoutineDays = document.querySelector('.routine-days-section');
                    if (sectionSubtasks) sectionSubtasks.style.display = 'flex';
                    if (sectionRoutineDays) sectionRoutineDays.style.display = 'none';
                    const subInput = document.getElementById('inputSubtasks');
                    if (itemToEdit.subtasks && itemToEdit.subtasks.length > 0) {
                        subInput.value = itemToEdit.subtasks.map(s => `▢ ${s}`).join('\n');
                    } else { subInput.value = ''; }
                    document.getElementById('btnSaveEntry').innerText = "Schedule Block";
                    document.getElementById('entryModal').classList.add('active');
                }
                return;
            }

            const subtaskItem = e.target.closest('.subtask-item');
            if (subtaskItem) {
                e.stopPropagation(); 
                if (navigator.vibrate) navigator.vibrate(10); 

                const wasCompleted = subtaskItem.classList.contains('completed');
                if (!wasCompleted) AudioEngine.playTick();
                
                // 1. Instantly trigger the left-to-right line draw
                if (wasCompleted) subtaskItem.classList.remove('completed');
                else subtaskItem.classList.add('completed');

                // 2. Wait 250ms for the line to draw
                setTimeout(() => {
                    const blockEl = subtaskItem.closest('.timeline-node-block');
                    const blockId = blockEl.getAttribute('data-id');
                    const blockType = blockEl.getAttribute('data-type');
                    const subtaskIndex = parseInt(subtaskItem.getAttribute('data-index'), 10);
                    
                    const checkedCount = State.toggleSubtask(blockId, subtaskIndex, State.currentDateKey);
                    const ul = subtaskItem.closest('.subtasks');
                    const totalSubtasks = parseInt(ul.getAttribute('data-total'), 10);
                    
                    // 3. THE FIX: Did this click complete the final subtask?
                    if (checkedCount === totalSubtasks && !wasCompleted) {
                        
                        if (navigator.vibrate) navigator.vibrate([20, 40, 20]); 
                        if (typeof AudioEngine !== 'undefined') AudioEngine.playChime();

                        // A. Instantly trigger the Cinematic Card Collapse
                        blockEl.classList.remove('active');
                        blockEl.classList.add('completed');

                        // B. Wait exactly 400ms for the bounce, THEN lock data
                        setTimeout(() => {
                            if (blockType === 'task') {
                                const task = State.tasks.find(t => t.id == blockId);
                                if (task) {
                                    task.status = 'completed';
                                    task.completed = true;
                                    import('./storage.js').then(module => module.Storage.set(`tasks_${State.currentDateKey}`, State.tasks));
                                }
                            } else if (blockType === 'routine') {
                                // NEW: Checking off all routine subtasks now completes the routine!
                                const isCompletedToday = State.routineCompletions[State.currentDateKey] && State.routineCompletions[State.currentDateKey].includes(blockId);
                                if (!isCompletedToday) {
                                    State.toggleRoutineCompletion(blockId, State.currentDateKey);
                                }
                            }
                            UI.renderTimeline();
                        }, 400);

                    } else {
                        // If it's just a regular check (not the final one)
                        if (blockType === 'task') {
                            const task = State.tasks.find(t => t.id == blockId);
                            if (task && checkedCount < totalSubtasks && task.status === 'completed') {
                                task.status = 'pending';
                                task.completed = false;
                                import('./storage.js').then(module => module.Storage.set(`tasks_${State.currentDateKey}`, State.tasks));
                            }
                        }
                        UI.renderTimeline(); 
                    }
                }, 250);
                return;
            }

            const blockEl = e.target.closest('.timeline-node-block');
            if (!blockEl) return;
            const taskId = blockEl.getAttribute('data-id');

            if (blockEl.classList.contains('yielded')) {
                if (!e.target.closest('.timeline-toggle-node') && !e.target.closest('.btn-task-menu')) {
                    if (navigator.vibrate) navigator.vibrate(10);
                    blockEl.classList.add('peek');
                    setTimeout(() => blockEl.classList.remove('peek'), 3000); 
                    return; 
                }
            }

            const toggleBtn = e.target.closest('.timeline-toggle-node');
            if (toggleBtn) {
                if (navigator.vibrate) navigator.vibrate(20);
                toggleBtn.style.transform = 'scale(1.2)';
                
                const blockEl = toggleBtn.closest('.timeline-node-block');
                const blockId = blockEl.getAttribute('data-id');
                const blockType = blockEl.getAttribute('data-type'); 
                
                // 1. Detect exact current visual state
                const isCompleted = blockEl.classList.contains('completed');
                const isActive = blockEl.classList.contains('active');
                const currentStatus = isCompleted ? 'completed' : (isActive ? 'active' : 'pending');
                
                if (!isCompleted && typeof AudioEngine !== 'undefined') AudioEngine.playChime();

                // 2. Instantly apply the CORRECT next visual state BEFORE data updates
                if (blockType === 'routine') {
                    // Routines are 2-State (Pending <-> Completed)
                    if (isCompleted) blockEl.classList.remove('completed');
                    else blockEl.classList.add('completed');
                } else {
                    // Tasks are 3-State (Pending -> Active -> Completed -> Pending)
                    if (currentStatus === 'pending') {
                        // Visually clear other active tasks to prevent double-glow
                        document.querySelectorAll('.timeline-node-block.active').forEach(el => el.classList.remove('active'));
                        blockEl.classList.add('active');
                    } else if (currentStatus === 'active') {
                        blockEl.classList.remove('active');
                        blockEl.classList.add('completed');
                    } else if (currentStatus === 'completed') {
                        blockEl.classList.remove('completed');
                    }
                }

                // 3. Wait exactly 400ms for the animation to finish, THEN lock the data and redraw
                setTimeout(() => {
                    if (blockType === 'routine') {
                        State.toggleRoutineCompletion(blockId, State.currentDateKey);
                    } else {
                        State.toggleTask(blockId);
                    }
                    UI.renderTimeline();
                }, 400);
                return;
            }

            const menuBtn = e.target.closest('.btn-task-menu');
            if (menuBtn) {
                e.stopPropagation();
                activeMenuBlockId = blockEl.getAttribute('data-id');
                activeMenuBlockType = blockEl.getAttribute('data-type'); 
                
                if (navigator.vibrate) navigator.vibrate(10); 
                
                const btnPushTom = document.getElementById('btnMenuPushTomorrow');
                const btnPushUnsch = document.getElementById('btnMenuPushUnscheduled');
                
                if (btnPushTom) btnPushTom.style.display = (activeMenuBlockType === 'routine') ? 'none' : 'flex';
                if (btnPushUnsch) btnPushUnsch.style.display = (activeMenuBlockType === 'routine') ? 'none' : 'flex';

                if (actionOverlay && actionSheet) {
                    actionOverlay.classList.add('show');
                    actionSheet.classList.add('show');
                }
                return;
            }
        });
    },

    bindRoutineActions() {
        const viewRoutines = document.getElementById('viewRoutines');
        if (!viewRoutines) return;

        viewRoutines.addEventListener('click', (e) => {
            const menuBtn = e.target.closest('.btn-task-menu');
            if (menuBtn) {
                e.stopPropagation();
                const blockEl = menuBtn.closest('.timeline-node-block');
                activeMenuBlockId = blockEl.getAttribute('data-id');
                
                // THE FIX: We forcefully declare this as a routine so the global Action Menu knows exactly what to do!
                activeMenuBlockType = 'routine'; 
                
                if (navigator.vibrate) navigator.vibrate(10); 
                
                const btnPushTom = document.getElementById('btnMenuPushTomorrow');
                const btnPushUnsch = document.getElementById('btnMenuPushUnscheduled');
                if (btnPushTom) btnPushTom.style.display = 'none';
                if (btnPushUnsch) btnPushUnsch.style.display = 'none';
                
                const actionOverlay = document.getElementById('actionMenuOverlay');
                const actionSheet = document.getElementById('actionMenuSheet');
                if (actionOverlay && actionSheet) {
                    actionOverlay.classList.add('show');
                    actionSheet.classList.add('show');
                }
                return;
            }

            // Fallback just in case any old buttons are still lingering
            const deleteBtn = e.target.closest('.btn-delete-routine');
            if (deleteBtn) {
                if (navigator.vibrate) navigator.vibrate([20, 50, 20]);
                const blockEl = e.target.closest('.timeline-node-block');
                const routineId = blockEl.getAttribute('data-id');
                
                blockEl.classList.add('slide-out-left');
                setTimeout(() => {
                    State.deleteRoutine(routineId);
                    UI.renderRoutines(); 
                    UI.renderTimeline(); 
                }, 250);
            }
        });
    },

    bindGestures() {
        // --- 1. SWIPE DOWN TO CLOSE MODALS ---
        const modals = document.querySelectorAll('.modal-overlay, .action-menu-overlay');
        
        modals.forEach(modal => {
            let startY = 0;
            let currentY = 0;
            const surface = modal.querySelector('.modal-surface') || 
                            modal.querySelector('.alert-modal-surface') || 
                            modal.querySelector('.action-menu-sheet');
            
            if (!surface) return;

            surface.addEventListener('touchstart', (e) => {
                // Protect scrollable areas! If we are scrolling down a list, don't trigger the close swipe.
                const scrollableContent = e.target.closest('.settings-content, .archive-modal-content, .subtask-input-area');
                if (scrollableContent && scrollableContent.scrollTop > 0) return;

                startY = e.touches[0].clientY;
            }, { passive: true });

            surface.addEventListener('touchmove', (e) => {
                if (!startY) return;
                currentY = e.touches[0].clientY;
                const diffY = currentY - startY;

                // Optional: We could add a rubber-band visual effect here in the future
            }, { passive: true });

            surface.addEventListener('touchend', (e) => {
                if (!startY || !currentY) return;
                const diffY = currentY - startY;

                // If the user swiped down more than 70 pixels, dismiss the modal
                if (diffY > 70) {
                    if (navigator.vibrate) navigator.vibrate(10);
                    modal.classList.remove('active');
                    
                    // Specific cleanup if it's the Action Menu
                    if (modal.id === 'actionMenuOverlay') {
                        document.getElementById('actionMenuSheet').classList.remove('show');
                    }
                }
                
                // Reset variables
                startY = 0;
                currentY = 0;
            });
        });

        // --- 2. SWIPE UP TO OPEN (BOTTOM DOCK) ---
        const bottomDock = document.querySelector('.bottom-dock');
        if (bottomDock) {
            let dockStartY = 0;
            let startX = 0;

            bottomDock.addEventListener('touchstart', (e) => {
                dockStartY = e.touches[0].clientY;
                startX = e.touches[0].clientX; // We track X to know WHICH side you swiped on!
            }, { passive: true });

            bottomDock.addEventListener('touchend', (e) => {
                if (!dockStartY) return;
                
                const endY = e.changedTouches[0].clientY;
                const diffY = dockStartY - endY; // Positive number means swiped UP

                // If the user swiped UP more than 40 pixels
                if (diffY > 40) {
                    const screenWidth = window.innerWidth;
                    
                    // If swiped on the left third of the screen -> Open Settings
                    if (startX < screenWidth / 3) {
                        const btnSettings = document.getElementById('btnOpenSettings');
                        if (btnSettings) {
                            if (navigator.vibrate) navigator.vibrate(10);
                            btnSettings.click(); // Reuse your existing flawless open logic!
                        }
                    } 
                    // Otherwise (Center or Right) -> Open Add Task
                    else {
                        const btnFab = document.getElementById('btnMainFab');
                        if (btnFab) {
                            if (navigator.vibrate) navigator.vibrate(15);
                            btnFab.click(); 
                        }
                    }
                }
                
                dockStartY = 0;
            });
        }
    }

}; // Final Events Block