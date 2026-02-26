// js/storage.js

export const Storage = {
    // We use a prefix so Slate's data never accidentally mixes with BLOK's data
    PREFIX: 'slate_app_',

    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(this.PREFIX + key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error(`Error reading ${key} from storage:`, error);
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(this.PREFIX + key, JSON.stringify(value));
        } catch (error) {
            console.error(`Error saving ${key} to storage:`, error);
        }
    },

    remove(key) {
        localStorage.removeItem(this.PREFIX + key);
    }
};