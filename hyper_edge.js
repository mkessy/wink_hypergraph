class Hyperedge {
    constructor(elements) {
        this.elements = elements;
    }

    toString() {
        return `(${this.elements.map(e => e.toString()).join(' ')})`;
    }

    get atom() {
        return false;
    }

    get mt() {
        if (this.elements.length > 0) {
            const first = this.elements[0];
            if (typeof first === 'string') {
                return first.split('/')[1] || 'C';
            }
        }
        return 'R';
    }
}

module.exports = { Hyperedge };
