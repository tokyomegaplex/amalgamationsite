// Always dark mode
document.body.classList.add('dark');

// Offset looping videos so similar clips don't play in sync
(function () {
  const offsets = {
    'juice-dust.mp4': 0,
    'space-dust.mp4': 4.5,
  };
  document.querySelectorAll('.work-item video').forEach((vid) => {
    const src = vid.querySelector('source')?.src || '';
    for (const [file, offset] of Object.entries(offsets)) {
      if (src.includes(file)) {
        vid.addEventListener('loadedmetadata', () => {
          vid.currentTime = offset % vid.duration;
        }, { once: true });
      }
    }
  });
})();

// Subtle scroll-based fade-in for sections
(function () {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll('section').forEach((section) => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(20px)';
    section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(section);
  });

  // CSS class for visible state
  const style = document.createElement('style');
  style.textContent = `
    section.visible {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
  `;
  document.head.appendChild(style);
})();
