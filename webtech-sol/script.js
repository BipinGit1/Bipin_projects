const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');

if (menuToggle && nav) {
  menuToggle.addEventListener('click', () => {
    const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!isExpanded));
    nav.classList.toggle('is-open');
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

const revealItems = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

revealItems.forEach((item) => observer.observe(item));

document.getElementById('year').textContent = new Date().getFullYear();

document.querySelectorAll('[data-project-slider]').forEach((slider) => {
  const slides = Array.from(slider.querySelectorAll('.project-slide'));
  const counter = slider.querySelector('.slide-count');
  let activeIndex = 0;

  function showSlide(index) {
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      slide.hidden = slideIndex !== activeIndex;
    });
    if (counter) counter.textContent = `${activeIndex + 1} / ${slides.length}`;
  }

  slider.querySelectorAll('[data-slide-direction]').forEach((button) => {
    button.addEventListener('click', () => {
      showSlide(activeIndex + Number(button.dataset.slideDirection));
    });
  });
});

document.querySelector('.contact-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('.form-status');
  if (!button || !status) return;

  const originalButtonText = button.textContent;
  button.disabled = true;
  button.textContent = 'Sending...';
  status.textContent = '';
  status.classList.remove('is-error');

  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Your request could not be sent. Please try again.');
    }

    status.textContent = result.message || 'Thanks! Your project request has been received.';
    form.reset();
  } catch (error) {
    status.textContent = error.message || 'Unable to send your request right now. Please try again later.';
    status.classList.add('is-error');
  } finally {
    button.disabled = false;
    button.textContent = originalButtonText;
  }
});
