function errtrack(err) {
    console.error('Unexpected error occurred:', err);
    alert(`Unexpected error occurred: ${err}\n${err?.stack}`)
}
window.addEventListener('error', errtrack);
window.addEventListener('unhandledrejection', (event) => {
    errtrack(event.reason);
});

window.unsetErrTrack = function () {
    window.removeEventListener('error', errtrack);
    window.removeEventListener('unhandledrejection', errtrack);
    delete window.unsetErrTrack;
}
