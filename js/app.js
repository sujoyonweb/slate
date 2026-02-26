// js/app.js
import { State } from './state.js';
import { UI } from './ui.js';
import { Events } from './events.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("slate. bootloader engaged.");
    
    // 1. Initialize the Brain & Data
    State.init();
    
    // 2. Draw the HTML (It will soon use State data)
    UI.init();
    
    // 3. Turn on the click listeners
    Events.init(); 
});