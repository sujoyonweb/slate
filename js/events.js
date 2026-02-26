// js/events.js
import { State } from './state.js';
import { UI } from './ui.js';
import { Storage } from './storage.js';

let activeMenuBlockId = null;
let activeMenuBlockType = null;
let editingBlockId = null;
let editingBlockType = null;

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
        if (!State.soundEnabled) return; 
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.03); 
        
        gain.gain.setValueAtTime(0.3 * this.masterVolume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.03);
    },
    playChime() {
        if (!State.soundEnabled) return; 
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        
        const playNote = (freq, startTime, duration) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.value = freq;
            
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
        this.bindGestures(); 
    },

    bindHeaderScroll() {
        const header = document.getElementById('appHeader');
        if (!header) return;

        const handleScroll = (e) => {
            if (e.target.scrollTop > 10) {
                header.classList.add('scrolled'); 
            } else {
                header.classList.remove('scrolled'); 
            }
        };

        const viewTimeline = document.getElementById('viewTimeline');
        const viewRoutines = document.getElementById('viewRoutines');

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
                UI.renderTimeline(true); 
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
                    if (sectionSubtasks) sectionSubtasks.style.display = 'flex'; 
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
            
            if (activeDays.length === 7) btnEveryday.classList.add('active');
            else btnEveryday.classList.remove('active');
            
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
                
                if (btnWorkdays.classList.contains('active')) {
                    btnWorkdays.classList.remove('active');
                    dayToggles.forEach(b => b.classList.remove('active'));
                } else {
                    dayToggles.forEach(b => {
                        const d = parseInt(b.dataset.day, 10);
                        if (d >= 1 && d <= 5) b.classList.add('active'); 
                        else b.classList.remove('active'); 
                    });
                }
                
                updateEverydayButton(); 
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
                updateEverydayButton(); 
            });
        }

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
                    UI.renderInboxArchive(); 
                    UI.renderTimeline();     
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
                        archiveModal.classList.remove('active'); 
                        
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

        const settingsModal = document.getElementById('settingsModal');
        const btnOpenSettings = document.getElementById('btnOpenSettings');

        if (btnOpenSettings && settingsModal) {
            btnOpenSettings.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate(10);
                
                const textInboxLimit = document.getElementById('textInboxLimit');
                if (textInboxLimit) textInboxLimit.innerText = State.inboxLimit;
                
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

        const btnToggleSound = document.getElementById('btnToggleSound');
        const soundToggleUI = document.getElementById('soundToggleUI');

        if (btnToggleSound && soundToggleUI) {
            btnToggleSound.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate(10);
                
                const isNowEnabled = State.toggleSound();
                
                if (isNowEnabled) {
                    soundToggleUI.classList.add('active'); 
                    AudioEngine.playTick(); 
                } else {
                    soundToggleUI.classList.remove('active'); 
                }
            });
        }

        const btnInboxMinus = document.getElementById('btnInboxMinus');
        const btnInboxPlus = document.getElementById('btnInboxPlus');
        const textInboxLimit = document.getElementById('textInboxLimit');

        const changeInboxLimit = (newVal) => {
            if (newVal < 1) newVal = 1;   
            if (newVal > 99) newVal = 99; 
            
            State.updateInboxLimit(newVal);            
            if (textInboxLimit) textInboxLimit.innerText = newVal; 
            
            if (navigator.vibrate) navigator.vibrate(10); 
            UI.renderTimeline(); 
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

        const btnTriggerReset = document.getElementById('btnTriggerReset');
        const resetModal = document.getElementById('resetModal');
        const btnCancelReset = document.getElementById('btnCancelReset');
        const btnConfirmReset = document.getElementById('btnConfirmReset');

        if (btnTriggerReset && resetModal) {
            btnTriggerReset.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate([30, 50, 30]); 
                resetModal.classList.add('active'); 
            });
        }

        if (btnCancelReset && resetModal) {
            btnCancelReset.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate(10);
                resetModal.classList.remove('active'); 
            });
        }

        if (btnConfirmReset) {
            btnConfirmReset.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate([50, 100, 50]); 
                btnConfirmReset.innerText = "Wiping..."; 
                btnConfirmReset.style.opacity = "0.5";
                
                setTimeout(() => {
                    State.factoryReset(); 
                }, 250); 
            });
        }

        const btnExportData = document.getElementById('btnExportData');
        if (btnExportData) {
            btnExportData.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate(10);
                State.exportData();
                UI.showToast("Backup exported successfully.");
            });
        }

        const btnImportData = document.getElementById('btnImportData');
        const fileImport = document.getElementById('fileImport');
        const syncDropzone = document.getElementById('syncDropzone');
        const settingsModalEl = document.getElementById('settingsModal');

        const processImportFile = (file) => {
            if (!file) return;
            
            if (file.type !== "application/json" && !file.name.endsWith('.json')) {
                UI.showToast("Please use a valid slate_backup.json file.");
                return;
            }

            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const jsonData = JSON.parse(event.target.result);
                    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
                    State.importData(jsonData); 
                } catch (err) {
                    alert("Invalid backup file. It might be corrupted.");
                    console.error(err);
                }
            };
            reader.readAsText(file);
        };

        if (btnImportData && fileImport) {
            btnImportData.addEventListener('click', () => {
                if (navigator.vibrate) navigator.vibrate(10);
                fileImport.click();
            });

            fileImport.addEventListener('change', (e) => {
                processImportFile(e.target.files[0]);
                e.target.value = ''; 
            });
        }

        if (syncDropzone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                syncDropzone.addEventListener(eventName, (e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                }, false);
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                syncDropzone.addEventListener(eventName, () => {
                    syncDropzone.classList.add('drag-over'); 
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                syncDropzone.addEventListener(eventName, () => {
                    syncDropzone.classList.remove('drag-over');
                }, false);
            });

            syncDropzone.addEventListener('drop', (e) => {
                const file = e.dataTransfer.files[0];
                processImportFile(file);
            });
        }

        if (settingsModalEl) {
            settingsModalEl.addEventListener('paste', (e) => {
                if (!settingsModalEl.classList.contains('active')) return;

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
                        if (sectionSubtasks) sectionSubtasks.style.display = 'flex'; 
                        if (sectionRoutineDays) sectionRoutineDays.style.display = 'block';
                        
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
                
                const blockEl = document.querySelector(`.timeline-node-block[data-id="${activeMenuBlockId}"]`);
                if (blockEl) blockEl.classList.add('animate-delete-left');
                
                actionOverlay.classList.remove('show');
                actionSheet.classList.remove('show');
                if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
                
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

                const blockEl = document.querySelector(`.timeline-node-block[data-id="${activeMenuBlockId}"]`);
                if (blockEl) blockEl.classList.add('animate-push-right');

                actionOverlay.classList.remove('show');
                actionSheet.classList.remove('show');
                if (navigator.vibrate) navigator.vibrate([15, 30]); 

                // THE FIX: Safe, Synchronous Saving
                setTimeout(() => {
                    const taskIndex = State.tasks.findIndex(t => t.id == activeMenuBlockId);
                    if (taskIndex === -1) return;
                    const taskToMove = State.tasks.splice(taskIndex, 1)[0]; 

                    const [year, month, day] = State.currentDateKey.split('-').map(Number);
                    const tmrwDate = new Date(year, month - 1, day + 1);
                    const tmrwKey = `${tmrwDate.getFullYear()}-${String(tmrwDate.getMonth() + 1).padStart(2, '0')}-${String(tmrwDate.getDate()).padStart(2, '0')}`;

                    Storage.set(`tasks_${State.currentDateKey}`, State.tasks);
                    const tmrwTasks = Storage.get(`tasks_${tmrwKey}`, []);
                    tmrwTasks.push(taskToMove);
                    Storage.set(`tasks_${tmrwKey}`, tmrwTasks);
                    
                    UI.renderTimeline(); 
                    UI.showToast("Pushed to tomorrow.");
                }, 300);
            });
        }

        const btnMenuPushUnscheduled = document.getElementById('btnMenuPushUnscheduled');
        if (btnMenuPushUnscheduled) {
            btnMenuPushUnscheduled.addEventListener('click', () => {
                if (!activeMenuBlockId || activeMenuBlockType !== 'task') return;

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

                // THE FIX: Safe, Synchronous Saving
                State.addInboxItem(taskToMove.title, taskToMove.subtasks);
                Storage.set(`tasks_${State.currentDateKey}`, State.tasks);

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
                    if (!success) { 
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
            
            const btnArchive = e.target.closest('#btnViewArchive');
            if (btnArchive) {
                if (navigator.vibrate) navigator.vibrate(10);
                UI.renderInboxArchive();
                document.getElementById('archiveModal').classList.add('active');
                return;
            }

            const btnDeleteInbox = e.target.closest('.btn-inbox-delete');
            if (btnDeleteInbox) {
                e.stopPropagation();
                if (navigator.vibrate) navigator.vibrate([20, 30]);
                
                const inboxItem = btnDeleteInbox.closest('.inbox-item');
                const inboxId = inboxItem.getAttribute('data-id');
                inboxItem.classList.add('animate-delete-left');
                
                setTimeout(() => {
                    State.deleteInboxItem(inboxId);
                    UI.renderTimeline();
                }, 300);
                return;
            }

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
                
                // THE FIX: Instantly trigger the line draw AND save the data before the animation delay
                if (wasCompleted) subtaskItem.classList.remove('completed');
                else subtaskItem.classList.add('completed');

                const blockEl = subtaskItem.closest('.timeline-node-block');
                const blockId = blockEl.getAttribute('data-id');
                const blockType = blockEl.getAttribute('data-type');
                const subtaskIndex = parseInt(subtaskItem.getAttribute('data-index'), 10);
                
                const checkedCount = State.toggleSubtask(blockId, subtaskIndex, State.currentDateKey);
                const ul = subtaskItem.closest('.subtasks');
                const totalSubtasks = parseInt(ul.getAttribute('data-total'), 10);

                // Wait 250ms for the line to draw
                setTimeout(() => {
                    if (checkedCount === totalSubtasks && !wasCompleted) {
                        
                        if (navigator.vibrate) navigator.vibrate([20, 40, 20]); 
                        if (typeof AudioEngine !== 'undefined') AudioEngine.playChime();

                        blockEl.classList.remove('active');
                        blockEl.classList.add('completed');

                        setTimeout(() => {
                            if (blockType === 'task') {
                                const task = State.tasks.find(t => t.id == blockId);
                                if (task) {
                                    task.status = 'completed';
                                    task.completed = true;
                                    Storage.set(`tasks_${State.currentDateKey}`, State.tasks);
                                }
                            } else if (blockType === 'routine') {
                                const isCompletedToday = State.routineCompletions[State.currentDateKey] && State.routineCompletions[State.currentDateKey].includes(blockId);
                                if (!isCompletedToday) {
                                    State.toggleRoutineCompletion(blockId, State.currentDateKey);
                                }
                            }
                            UI.renderTimeline();
                        }, 400);

                    } else {
                        if (blockType === 'task') {
                            const task = State.tasks.find(t => t.id == blockId);
                            if (task && checkedCount < totalSubtasks && task.status === 'completed') {
                                task.status = 'pending';
                                task.completed = false;
                                Storage.set(`tasks_${State.currentDateKey}`, State.tasks);
                            }
                        } else if (blockType === 'routine') {
                            // NEW: Un-complete the routine if a subtask is unchecked!
                            const isCompletedToday = State.routineCompletions[State.currentDateKey] && State.routineCompletions[State.currentDateKey].includes(blockId);
                            if (isCompletedToday && checkedCount < totalSubtasks) {
                                State.toggleRoutineCompletion(blockId, State.currentDateKey);
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
                
                const isCompleted = blockEl.classList.contains('completed');
                const isActive = blockEl.classList.contains('active');
                const currentStatus = isCompleted ? 'completed' : (isActive ? 'active' : 'pending');
                
                if (!isCompleted && typeof AudioEngine !== 'undefined') AudioEngine.playChime();

                if (blockType === 'routine') {
                    if (isCompleted) blockEl.classList.remove('completed');
                    else blockEl.classList.add('completed');
                } else {
                    if (currentStatus === 'pending') {
                        document.querySelectorAll('.timeline-node-block.active').forEach(el => el.classList.remove('active'));
                        blockEl.classList.add('active');
                    } else if (currentStatus === 'active') {
                        blockEl.classList.remove('active');
                        blockEl.classList.add('completed');
                    } else if (currentStatus === 'completed') {
                        blockEl.classList.remove('completed');
                    }
                }

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
        const modals = document.querySelectorAll('.modal-overlay, .action-menu-overlay');
        
        modals.forEach(modal => {
            let startY = 0;
            let currentY = 0;
            const surface = modal.querySelector('.modal-surface') || 
                            modal.querySelector('.alert-modal-surface') || 
                            modal.querySelector('.action-menu-sheet');
            
            if (!surface) return;

            surface.addEventListener('touchstart', (e) => {
                const scrollableContent = e.target.closest('.settings-content, .archive-modal-content, .subtask-input-area');
                if (scrollableContent && scrollableContent.scrollTop > 0) return;

                startY = e.touches[0].clientY;
            }, { passive: true });

            surface.addEventListener('touchmove', (e) => {
                if (!startY) return;
                currentY = e.touches[0].clientY;
            }, { passive: true });

            surface.addEventListener('touchend', (e) => {
                if (!startY || !currentY) return;
                const diffY = currentY - startY;

                if (diffY > 70) {
                    if (navigator.vibrate) navigator.vibrate(10);
                    modal.classList.remove('active');
                    
                    if (modal.id === 'actionMenuOverlay') {
                        document.getElementById('actionMenuSheet').classList.remove('show');
                    }
                }
                
                startY = 0;
                currentY = 0;
            });
        });

        const bottomDock = document.querySelector('.bottom-dock');
        if (bottomDock) {
            let dockStartY = 0;
            let startX = 0;

            bottomDock.addEventListener('touchstart', (e) => {
                dockStartY = e.touches[0].clientY;
                startX = e.touches[0].clientX; 
            }, { passive: true });

            bottomDock.addEventListener('touchend', (e) => {
                if (!dockStartY) return;
                
                const endY = e.changedTouches[0].clientY;
                const diffY = dockStartY - endY; 

                if (diffY > 40) {
                    const screenWidth = window.innerWidth;
                    
                    if (startX < screenWidth / 3) {
                        const btnSettings = document.getElementById('btnOpenSettings');
                        if (btnSettings) {
                            if (navigator.vibrate) navigator.vibrate(10);
                            btnSettings.click(); 
                        }
                    } 
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