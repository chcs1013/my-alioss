const url = new URL(location.href);
url.searchParams.delete('preload');
history.replaceState({}, document.title, url.href);