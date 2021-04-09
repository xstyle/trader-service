export class Locker {
    private state: { [id: string]: boolean; };
    constructor() {
        this.state = {};
    }
    isLocked(id: string): boolean {
        return this.state[id];
    }
    lock(id: string): void {
        this.state[id] = true;
    }
    unlock(id: string): void {
        this.state[id] = false;
    }
    unlockWithTimeout(id: string, timeout: number) {
        setTimeout(() => this.unlock(id), timeout)
    }
}