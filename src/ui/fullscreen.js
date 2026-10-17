export function setupFullscreen(target, button) {
    const document = target.ownerDocument;
    if (document.fullscreenEnabled === false || typeof target.requestFullscreen !== 'function' || typeof document.exitFullscreen !== 'function') {
        button.hidden = true;
        return;
    }
    const enterIcon = button.querySelector('[data-fullscreen-enter]');
    const exitIcon = button.querySelector('[data-fullscreen-exit]');
    let pending = false;
    function sync() {
        const active = document.fullscreenElement === target;
        const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(active));
        button.title = label;
        button.disabled = pending;
        enterIcon.toggleAttribute('hidden', active);
        exitIcon.toggleAttribute('hidden', !active);
    }
    button.addEventListener('click', async () => {
        if (pending)
            return;
        pending = true;
        sync();
        try {
            if (document.fullscreenElement === target)
                await document.exitFullscreen();
            else
                await target.requestFullscreen();
        }
        catch {
            // Browser policy or an interrupted request can deny fullscreen.
            // Keep the control usable and reflect the browser's actual state.
        }
        finally {
            pending = false;
            sync();
        }
    });
    document.addEventListener('fullscreenchange', sync);
    sync();
}
