import test from 'node:test';
import assert from 'node:assert/strict';
import { setupFullscreen } from '#lab/ui/fullscreen.js';

function fixture() {
    const document = new EventTarget();
    document.fullscreenEnabled = true;
    document.fullscreenElement = null;
    const setFullscreen = element => {
        document.fullscreenElement = element;
        document.dispatchEvent(new Event('fullscreenchange'));
    };
    const target = { ownerDocument: document, async requestFullscreen() { setFullscreen(target); } };
    document.exitFullscreen = async () => setFullscreen(null);
    const button = new EventTarget();
    const attributes = new Map();
    const icon = () => {
        const attributes = new Set();
        return {
            toggleAttribute(name, force) { if (force) attributes.add(name); else attributes.delete(name); },
            hasAttribute: name => attributes.has(name)
        };
    };
    const enterIcon = icon(), exitIcon = icon();
    button.setAttribute = (name, value) => attributes.set(name, value);
    button.querySelector = selector => selector === '[data-fullscreen-enter]' ? enterIcon : exitIcon;
    const click = async () => {
        button.dispatchEvent(new Event('click'));
        await new Promise(resolve => setImmediate(resolve));
    };
    return { document, target, button, attributes, enterIcon, exitIcon, setFullscreen, click };
}

test('Fullscreen control enters and exits the scene and follows external exits', async () => {
    const f = fixture();
    setupFullscreen(f.target, f.button);
    assert.equal(f.attributes.get('aria-label'), 'Enter fullscreen');
    assert.equal(f.attributes.get('aria-pressed'), 'false');
    assert.equal(f.enterIcon.hasAttribute('hidden'), false);
    assert.equal(f.exitIcon.hasAttribute('hidden'), true);
    await f.click();
    assert.equal(f.document.fullscreenElement, f.target);
    assert.equal(f.attributes.get('aria-label'), 'Exit fullscreen');
    assert.equal(f.button.title, 'Exit fullscreen');
    assert.equal(f.attributes.get('aria-pressed'), 'true');
    assert.equal(f.enterIcon.hasAttribute('hidden'), true);
    assert.equal(f.exitIcon.hasAttribute('hidden'), false);
    await f.click();
    assert.equal(f.document.fullscreenElement, null);
    assert.equal(f.attributes.get('aria-label'), 'Enter fullscreen');
    await f.click();
    f.setFullscreen(null); // Escape, browser UI, or another fullscreen element.
    assert.equal(f.attributes.get('aria-pressed'), 'false');
    assert.equal(f.button.title, 'Enter fullscreen');
    assert.equal(f.enterIcon.hasAttribute('hidden'), false);
    assert.equal(f.exitIcon.hasAttribute('hidden'), true);
});

test('Unavailable fullscreen is hidden without wiring a broken control', () => {
    for (const disable of [f => { f.document.fullscreenEnabled = false; }, f => { delete f.target.requestFullscreen; }]) {
        const f = fixture();
        disable(f);
        setupFullscreen(f.target, f.button);
        assert.equal(f.button.hidden, true);
    }
});

test('A rejected fullscreen request preserves the actual state and permits retry', async () => {
    const f = fixture();
    const request = f.target.requestFullscreen;
    f.target.requestFullscreen = async () => { throw new Error('Fullscreen denied'); };
    setupFullscreen(f.target, f.button);
    await f.click();
    assert.equal(f.document.fullscreenElement, null);
    assert.equal(f.button.disabled, false);
    assert.equal(f.attributes.get('aria-pressed'), 'false');
    f.target.requestFullscreen = request;
    await f.click();
    assert.equal(f.document.fullscreenElement, f.target);
    assert.equal(f.button.disabled, false);
});
