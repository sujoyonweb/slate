// js/ui.js
import { State } from './state.js';

export const UI = {
    init() {
        this.renderNavPill();
        this.renderDateStrip();
        this.renderTimeline(true);
        this.renderRoutines();
        this.startHeartbeat();
    },

    startHeartbeat() {
        setInterval(() => {
            const todayObj = State.dates.find(d => d.isToday);
            if (todayObj && State.currentDateKey === todayObj.key && document.getElementById('viewTimeline').style.display !== 'none') {
                this.renderTimeline();
            }
        }, 60000); 
    },

    renderNavPill() {
        const header = document.getElementById('appHeader');
        if (!header) return;
        header.innerHTML = `
            <div class="pill-container" id="navPill">
                <button class="pill-btn active" data-target="viewTimeline">Timeline</button>
                <button class="pill-btn" data-target="viewRoutines">Routines</button>
                <div class="pill-indicator" id="pillIndicator"></div>
            </div>
        `;
    },

    renderDateStrip() {
        const viewTimeline = document.getElementById('viewTimeline');
        if (!viewTimeline) return;

        let dateStrip = document.getElementById('dateStrip');
        if (!dateStrip) {
            dateStrip = document.createElement('header');
            dateStrip.id = 'dateStrip';
            dateStrip.className = 'date-strip';
            viewTimeline.insertBefore(dateStrip, viewTimeline.firstChild);
        }

        dateStrip.innerHTML = State.dates.map(dateObj => `
            <div class="date-item ${dateObj.key === State.currentDateKey ? 'active' : ''} ${dateObj.isToday ? 'is-today' : ''}" data-key="${dateObj.key}">
                <span style="font-family: var(--font-sans); font-size: 11px; text-transform: uppercase;">${dateObj.dayName}</span>
                <span style="font-size: 18px; margin-top: 2px;">${dateObj.dateNum}</span>
                <div class="date-indicator"></div>
            </div>
        `).join('');
    },

    formatDisplayTime(time24) {
        let [h, m] = time24.split(':');
        h = parseInt(h, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12; 
        return `${h.toString().padStart(2, '0')}:${m} ${ampm}`;
    },

    renderTimeline(animate = false) {
        const viewTimeline = document.getElementById('viewTimeline');
        if (!viewTimeline) return;

        let container = document.getElementById('timelineContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'timelineContainer';
            container.className = 'timeline-container';
            viewTimeline.appendChild(container);
        }

        const [y, m, d] = State.currentDateKey.split('-').map(Number);
        const currentDayIndex = new Date(y, m - 1, d).getDay();

        let combinedBlocks = [...State.tasks];

        State.routines.forEach(routine => {
            const isSkipped = State.routineOverrides[State.currentDateKey] && State.routineOverrides[State.currentDateKey].includes(routine.id);
            if (routine.days && routine.days.includes(currentDayIndex) && !isSkipped) {
                combinedBlocks.push({ ...routine, isRoutineInstance: true });
            }
        });

        combinedBlocks.sort((a, b) => a.time.localeCompare(b.time));

        let htmlOutput = ``;

        if (combinedBlocks.length === 0) {
            htmlOutput += `
                <div class="empty-state">
<pre>
  +---+
 /   /|
+---+ +
|   |/
+---+
</pre>
                    <p>No focus blocks scheduled.</p>
                </div>
            `;
        } else {
            const todayObj = State.dates.find(d => d.isToday);
            const isToday = todayObj && State.currentDateKey === todayObj.key;

            if (isToday) {
                const now = new Date();
                const hr = now.getHours().toString().padStart(2, '0');
                const min = now.getMinutes().toString().padStart(2, '0');
                
                combinedBlocks.push({ id: 'now_indicator', time: `${hr}:${min}`, isNowIndicator: true });
                combinedBlocks.sort((a, b) => a.time.localeCompare(b.time));
            }

            const timeWinners = {};
            combinedBlocks.forEach(block => {
                if (block.isNowIndicator) return; 
                const currentWinner = timeWinners[block.time];
                if (!currentWinner) {
                    timeWinners[block.time] = block;
                } else {
                    const blockIsActive = block.status === 'active';
                    const winnerIsActive = currentWinner.status === 'active';
                    if (blockIsActive) {
                        timeWinners[block.time] = block;
                    } else if (!winnerIsActive && block.id > currentWinner.id) {
                        timeWinners[block.time] = block; 
                    }
                }
            });

            // THE FIX: Accurate True-Status Checker for Suggested Focus
            let suggestedBlockId = null;
            const hasActiveTask = combinedBlocks.some(b => b.status === 'active');
            
            if (isToday && !hasActiveTask) {
                const nowIndex = combinedBlocks.findIndex(b => b.isNowIndicator);
                
                const getTrueStatus = (b) => {
                    if (b.isRoutineInstance) {
                        return (State.routineCompletions[State.currentDateKey] && State.routineCompletions[State.currentDateKey].includes(b.id)) ? 'completed' : 'pending';
                    }
                    return b.status || (b.completed ? 'completed' : 'pending');
                };

                if (nowIndex !== -1) {
                    for (let i = nowIndex - 1; i >= 0; i--) {
                        const b = combinedBlocks[i];
                        if (getTrueStatus(b) !== 'completed' && timeWinners[b.time].id === b.id) {
                            suggestedBlockId = b.id;
                            break;
                        }
                    }
                    if (!suggestedBlockId) {
                        for (let i = nowIndex + 1; i < combinedBlocks.length; i++) {
                            const b = combinedBlocks[i];
                            if (getTrueStatus(b) !== 'completed' && timeWinners[b.time].id === b.id) {
                                suggestedBlockId = b.id;
                                break;
                            }
                        }
                    }
                }
            }

            htmlOutput += `<div class="timeline-list-wrapper">`;

            let delayIndex = 0;

            combinedBlocks.forEach(block => {
                const animClass = animate ? 'cascade-in' : '';
                const animStyle = animate ? `animation-delay: ${delayIndex * 0.04}s;` : '';

                if (block.isNowIndicator) {
                    htmlOutput += `
                        <div class="now-indicator-wrapper ${animClass}" style="${animStyle}">
                            <div class="now-indicator-dot"></div>
                            <div class="now-indicator-line"></div>
                        </div>
                    `;
                    if (animate) delayIndex++;
                    return; 
                }
                
                let status = block.status || (block.completed ? 'completed' : 'pending');
                if (block.isRoutineInstance) {
                    const isCompletedToday = State.routineCompletions[State.currentDateKey] && State.routineCompletions[State.currentDateKey].includes(block.id);
                    status = isCompletedToday ? 'completed' : 'pending';
                }
                
                let icon = '○';
                if (status === 'active') icon = '◎';
                if (status === 'completed') icon = '●';

                const isYielded = timeWinners[block.time].id !== block.id;
                const yieldClass = isYielded ? 'yielded' : '';
                const displayTime = this.formatDisplayTime(block.time);
                
                let subtasksHTML = '';
                if (block.subtasks && block.subtasks.length > 0) {
                    const stateKey = `${State.currentDateKey}_${block.id}`;
                    const completedArr = State.subtaskStates[stateKey] || [];
                    
                    const listItems = block.subtasks.map((st, index) => {
                        const isChecked = completedArr.includes(index);
                        const checkClass = isChecked ? 'completed' : '';
                        
                        return `
                            <li class="subtask-item ${checkClass}" data-index="${index}">
                                <div class="subtask-checkbox">
                                    <svg viewBox="0 0 12 10"><polyline points="1.5 6 4.5 9 10.5 1"></polyline></svg>
                                </div>
                                <span class="subtask-text">${st}</span>
                            </li>
                        `;
                    }).join('');
                    subtasksHTML = `<ul class="subtasks" data-total="${block.subtasks.length}">${listItems}</ul>`;
                }

                const blockClass = block.isRoutineInstance ? 'routine' : 'task';
                const blockType = block.isRoutineInstance ? 'routine' : 'task'; 
                const suggestedClass = (block.id === suggestedBlockId) ? 'suggested-focus' : '';
                
                if (animate) delayIndex++;

                htmlOutput += `
                    <div class="timeline-node-block ${status} ${yieldClass} ${suggestedClass} ${animClass}" style="${animStyle}" data-id="${block.id}" data-type="${blockType}">
                        <button class="timeline-toggle-node">${icon}</button>
                        <div class="block ${blockClass}">
                            <div class="block-content">
                                <div class="block-time">${displayTime}</div>
                                <div class="block-title">${block.title}</div>
                                ${subtasksHTML}
                            </div>
                            <button class="btn-task-menu" title="Menu" style="background:none; border:none; cursor:pointer; padding: 4px; display:flex; align-items:center; justify-content:center; opacity: 0.6; transition: opacity 0.2s;">
                                <svg width="16" height="4" viewBox="0 0 16 4" fill="var(--text-muted)">
                                    <circle cx="2" cy="2" r="2"/>
                                    <circle cx="8" cy="2" r="2"/>
                                    <circle cx="14" cy="2" r="2"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            });

            htmlOutput += `</div>`; 
        }

        const visibleInbox = State.inbox.slice(0, State.inboxVisibleLimit);
        const hiddenCount = State.inbox.length - State.inboxVisibleLimit;

        htmlOutput += `
            <div class="inbox-section">
                <div class="inbox-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inbox-icon"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>
                    <span>Unscheduled Inbox (${State.inbox.length}/${State.inboxLimit})</span>
                </div>
                <div class="inbox-list">
                    ${visibleInbox.map(item => `
                        <div class="inbox-item" data-id="${item.id}">
                            <div class="inbox-item-content">
                                <span class="inbox-title">${item.title}</span>
                                ${item.subtasks && item.subtasks.length > 0 ? `<span class="inbox-badge">${item.subtasks.length} subtasks</span>` : ''}
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <button class="btn-inbox-schedule">Schedule</button>
                                <button class="btn-inbox-delete" title="Delete">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                ${hiddenCount > 0 ? `<button id="btnViewArchive" class="btn-view-archive">📂 View all ${State.inbox.length} saved items</button>` : ''}
                <div class="inbox-input-wrapper">
                    <input type="text" id="inputQuickInbox" class="inbox-input" placeholder="Quick capture an idea..." autocomplete="off">
                </div>
            </div>
        `;

        container.innerHTML = htmlOutput;
    },

    renderRoutines() {
        const viewRoutines = document.getElementById('viewRoutines');
        if (!viewRoutines) return;

        if (State.routines.length === 0) {
            viewRoutines.innerHTML = `
                <div class="empty-state" style="margin-top: 100px;">
<pre>
  +---+
 /   /|
+---+ +
|   |/
+---+
</pre>
                    <p>No master routines set.</p>
                </div>
            `;
            return;
        }

        let htmlOutput = `<div class="timeline-container" style="padding-top: 80px;">`;
        htmlOutput += `<div class="timeline-list-wrapper">`; 

        const dayMap = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        State.routines.forEach(routine => {
            const displayTime = this.formatDisplayTime(routine.time);
            
            let daysString = 'Everyday';
            if (routine.days && routine.days.length !== 7) {
                const isWorkdays = routine.days.length === 5 && !routine.days.includes(0) && !routine.days.includes(6);
                if (isWorkdays) {
                    daysString = 'Workdays';
                } else {
                    daysString = routine.days.map(d => dayMap[d]).join(' ');
                }
            }

            let subtasksHTML = '';
            if (routine.subtasks && routine.subtasks.length > 0) {
                const listItems = routine.subtasks.map(st => `
                    <li style="color: var(--text-muted); font-size: 13px; font-family: var(--font-mono); margin-bottom: 4px;">
                        <span style="opacity: 0.5; margin-right: 6px;">-</span>${st}
                    </li>
                `).join('');
                subtasksHTML = `<ul style="list-style: none; padding: 0; margin-top: 10px; border-top: 1px dashed var(--border-muted); padding-top: 10px;">${listItems}</ul>`;
            }

            htmlOutput += `
                <div class="timeline-node-block" data-id="${routine.id}">
                    <div class="timeline-toggle-node" style="cursor: default; opacity: 0.5;">○</div> 
                    <div class="block routine">
                        <div class="block-content">
                            <div class="block-time">${displayTime} &bull; ${daysString}</div>
                            <div class="block-title">${routine.title}</div>
                            ${subtasksHTML}
                        </div>
                        <button class="btn-task-menu" title="Menu" style="background:none; border:none; cursor:pointer; padding: 4px; display:flex; align-items:center; justify-content:center; opacity: 0.6; transition: opacity 0.2s;">
                            <svg width="16" height="4" viewBox="0 0 16 4" fill="var(--text-muted)">
                                <circle cx="2" cy="2" r="2"/>
                                <circle cx="8" cy="2" r="2"/>
                                <circle cx="14" cy="2" r="2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        });

        htmlOutput += `</div></div>`; 
        viewRoutines.innerHTML = htmlOutput;
    },

    renderInboxArchive() {
        const listEl = document.getElementById('archiveList');
        if (!listEl) return;
        
        if (State.inbox.length === 0) {
            listEl.innerHTML = `<div class="empty-state"><p>Archive is empty.</p></div>`;
            return;
        }

        listEl.innerHTML = [...State.inbox].reverse().map(item => `
            <div class="inbox-item" data-id="${item.id}" style="margin-bottom: 10px;">
                <div class="inbox-item-content">
                    <span class="inbox-title">${item.title}</span>
                    ${item.subtasks && item.subtasks.length > 0 ? `<span class="inbox-badge">${item.subtasks.length} subtasks</span>` : ''}
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button class="btn-inbox-schedule">Schedule</button>
                    <button class="btn-inbox-delete" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
        `).join('');
    },

    showToast(message) {
        const toast = document.getElementById('toastNotification');
        const toastMsg = document.getElementById('toastMessage');
        if (!toast || !toastMsg) return;

        toastMsg.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}; // End