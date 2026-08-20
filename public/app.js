(function () {
  const PASSCODE_STORAGE_KEY = 'classSitePasscode';

  const gate = document.getElementById('gate');
  const gateForm = document.getElementById('gate-form');
  const gateInput = document.getElementById('gate-input');
  const gateError = document.getElementById('gate-error');
  const site = document.getElementById('site');

  const profileForm = document.getElementById('profile-form');
  const submitBtn = document.getElementById('submit-btn');
  const formError = document.getElementById('form-error');
  const photoInput = document.getElementById('photo');
  const photoPreview = document.getElementById('photo-preview');
  const photoPreviewImg = document.getElementById('photo-preview-img');
  const photoRemove = document.getElementById('photo-remove');
  const profilesStatus = document.getElementById('profiles-status');
  const profilesGrid = document.getElementById('profiles-grid');

  let photoDataUrl = null;

  function getStoredPasscode() {
    return sessionStorage.getItem(PASSCODE_STORAGE_KEY);
  }

  function setStoredPasscode(code) {
    sessionStorage.setItem(PASSCODE_STORAGE_KEY, code);
  }

  function unlockSite() {
    gate.classList.add('hidden');
    site.classList.remove('hidden');
    loadProfiles();
  }

  async function verifyPasscode(candidate) {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Could not verify passcode right now');
    const { passcode } = await res.json();
    return candidate === passcode;
  }

  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    gateError.classList.add('hidden');
    const candidate = gateInput.value.trim();
    if (!candidate) return;

    try {
      const isValid = await verifyPasscode(candidate);
      if (isValid) {
        setStoredPasscode(candidate);
        unlockSite();
      } else {
        gateError.textContent = 'Incorrect passcode. Try again.';
        gateError.classList.remove('hidden');
        gateInput.value = '';
        gateInput.focus();
      }
    } catch (err) {
      gateError.textContent = 'Something went wrong. Please try again.';
      gateError.classList.remove('hidden');
    }
  });

  // Colors for generated avatars, picked for good contrast with white text.
  const AVATAR_COLORS = ['#4f5df7', '#e0578e', '#2fa88f', '#e08a2f', '#8a5cf5', '#2f9be0', '#e05656'];

  function colorForName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATAR_COLORS.length;
    return AVATAR_COLORS[index];
  }

  function renderProfileCard(profile) {
    const card = document.createElement('div');
    card.className = 'profile-card';

    if (profile.photoUrl) {
      const img = document.createElement('img');
      img.className = 'profile-photo';
      img.src = profile.photoUrl;
      img.alt = profile.firstName;
      card.appendChild(img);
    } else {
      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.style.background = colorForName(profile.firstName || '?');
      avatar.textContent = (profile.firstName || '?').charAt(0).toUpperCase();
      card.appendChild(avatar);
    }

    const name = document.createElement('h3');
    name.textContent = profile.firstName;
    card.appendChild(name);

    const major = document.createElement('p');
    major.className = 'meta';
    major.textContent = `${profile.major} · ${profile.year}`;
    card.appendChild(major);

    const hometown = document.createElement('p');
    hometown.className = 'meta';
    hometown.textContent = profile.hometown;
    card.appendChild(hometown);

    return card;
  }

  function renderProfiles(profiles) {
    profilesGrid.innerHTML = '';
    if (!profiles.length) {
      profilesStatus.textContent = 'No profiles yet — be the first to add one!';
      profilesStatus.classList.remove('hidden');
      return;
    }
    profilesStatus.classList.add('hidden');
    profiles.forEach((profile) => {
      profilesGrid.appendChild(renderProfileCard(profile));
    });
  }

  async function loadProfiles() {
    profilesStatus.textContent = 'Loading profiles...';
    profilesStatus.classList.remove('hidden');
    try {
      const res = await fetch('/api/profiles', {
        headers: { 'x-passcode': getStoredPasscode() || '' },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(PASSCODE_STORAGE_KEY);
        location.reload();
        return;
      }
      if (!res.ok) throw new Error('Failed to load profiles');
      const { profiles } = await res.json();
      renderProfiles(profiles);
    } catch (err) {
      profilesStatus.textContent = 'Could not load profiles. Please refresh the page.';
      profilesStatus.classList.remove('hidden');
    }
  }

  const MAX_PHOTO_DIMENSION = 1000;
  // Vercel Functions reject request bodies over 4.5 MB, and base64 encoding
  // inflates a photo by roughly a third, so keep the encoded string well under.
  const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file does not look like an image.'));
      img.src = dataUrl;
    });
  }

  // Photos straight off a phone are usually several megabytes, which would
  // exceed the upload limit and make the grid slow to load. Shrinking them
  // here keeps uploads small and the page quick on mobile.
  async function shrinkImage(file) {
    const img = await loadImage(await readFileAsDataUrl(file));

    const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));

    const ctx = canvas.getContext('2d');
    // Flatten onto white so transparent PNGs don't come out black as JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const candidate = canvas.toDataURL('image/jpeg', quality);
      if (candidate.length <= MAX_UPLOAD_BYTES) return candidate;
    }
    throw new Error('That photo is too large. Please try a smaller one.');
  }

  photoInput.addEventListener('change', async () => {
    formError.classList.add('hidden');
    const file = photoInput.files[0];
    if (!file) {
      photoDataUrl = null;
      photoPreview.classList.add('hidden');
      return;
    }

    try {
      photoDataUrl = await shrinkImage(file);
      photoPreviewImg.src = photoDataUrl;
      photoPreview.classList.remove('hidden');
    } catch (err) {
      photoDataUrl = null;
      photoInput.value = '';
      photoPreview.classList.add('hidden');
      formError.textContent = err.message;
      formError.classList.remove('hidden');
    }
  });

  photoRemove.addEventListener('click', () => {
    photoDataUrl = null;
    photoInput.value = '';
    photoPreview.classList.add('hidden');
  });

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    const payload = {
      firstName: document.getElementById('firstName').value.trim(),
      major: document.getElementById('major').value.trim(),
      year: document.getElementById('year').value,
      hometown: document.getElementById('hometown').value.trim(),
      photoDataUrl: photoDataUrl || undefined,
    };

    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-passcode': getStoredPasscode() || '',
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        sessionStorage.removeItem(PASSCODE_STORAGE_KEY);
        location.reload();
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not save profile');
      }

      renderProfiles(data.profiles);
      profileForm.reset();
      photoDataUrl = null;
      photoPreview.classList.add('hidden');
    } catch (err) {
      formError.textContent = err.message || 'Something went wrong. Please try again.';
      formError.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add my profile';
    }
  });

  // Auto-unlock if a valid passcode is already stored for this session.
  (async function init() {
    const stored = getStoredPasscode();
    if (!stored) return;
    try {
      const isValid = await verifyPasscode(stored);
      if (isValid) unlockSite();
      else sessionStorage.removeItem(PASSCODE_STORAGE_KEY);
    } catch (err) {
      // Stay on gate screen; user can retry.
    }
  })();
})();
