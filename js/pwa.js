/**
 * ===================== PWA UTILITIES =====================
 * - Registra o Service Worker
 * - Captura o prompt de instalação (Android/Desktop)
 * - Exibe banner de instalação adaptado por plataforma
 * - Detecta modo standalone (app instalado)
 * - Exibe banner de atualização quando nova versão disponível
 */

const PWA = (() => {
  let _installPrompt = null;

  // ===== Detecção de plataforma =====

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isAndroid() {
    return /Android/.test(navigator.userAgent);
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || navigator.standalone === true;
  }

  function isDesktop() {
    return !isIOS() && !isAndroid();
  }

  function getPlatform() {
    if (isIOS()) return 'ios';
    if (isAndroid()) return 'android';
    return 'desktop';
  }

  // ===== Service Worker =====

  function registerSW() {
    if (!('serviceWorker' in navigator)) {
      console.log('[PWA] Service Worker não suportado neste navegador');
      return;
    }

    let _updateReady = false; // só recarrega em update, nunca no 1º install
    let _reloading = false;

    // Quando o novo SW assume o controle (após um update), recarrega para aplicar
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!_updateReady || _reloading) return;
      _reloading = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('[PWA] Service Worker registrado. Scope:', reg.scope);

        // Nova versão instalada com um SW já no controle = atualização → arma o reload
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              _updateReady = true; // o controllerchange seguinte recarrega sozinho
            }
          });
        });
      })
      .catch(err => console.warn('[PWA] Falha ao registrar SW:', err));
  }

  // ===== Prompt de instalação =====

  function captureInstallPrompt() {
    // Android / Desktop Chrome/Edge: evento nativo
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      _installPrompt = e;
      if (!_wasBannerDismissed()) showInstallBanner('browser');
    });

    // Confirma instalação
    window.addEventListener('appinstalled', () => {
      _installPrompt = null;
      _removeBanner('pwa-install-banner');
      localStorage.setItem('lifeos-pwa-installed', '1');
      console.log('[PWA] App instalado com sucesso!');
    });

    // iOS: instruções manuais (Share → Add to Home Screen)
    if (isIOS() && !isStandalone() && !_wasBannerDismissed()) {
      setTimeout(() => showInstallBanner('ios'), 5000);
    }
  }

  function installApp() {
    if (!_installPrompt) return;
    _installPrompt.prompt();
    _installPrompt.userChoice.then(choice => {
      if (choice.outcome === 'accepted') _removeBanner('pwa-install-banner');
      _installPrompt = null;
    });
  }

  function _wasBannerDismissed() {
    const ts = localStorage.getItem('lifeos-banner-dismissed');
    if (!ts) return false;
    const daysAgo = (Date.now() - parseInt(ts, 10)) / 86400000;
    return daysAgo < 7; // reaparece após 7 dias
  }

  function dismissBanner() {
    _removeBanner('pwa-install-banner');
    localStorage.setItem('lifeos-banner-dismissed', Date.now().toString());
  }

  function _removeBanner(id) {
    document.getElementById(id)?.remove();
  }

  // ===== Banners visuais =====

  const BANNER_STYLE = [
    'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
    'background:#1E293B', 'border:1px solid #334155', 'border-radius:16px',
    'padding:14px 18px', 'display:flex', 'align-items:center', 'gap:10px',
    'z-index:10000', 'box-shadow:0 8px 40px rgba(0,0,0,.55)',
    'max-width:min(400px,calc(100vw - 32px))', 'width:100%',
    "font-family:system-ui,-apple-system,'Segoe UI',sans-serif",
    'animation:pwa-in .3s cubic-bezier(.34,1.56,.64,1)',
  ].join(';');

  function _ensureBannerStyles() {
    if (document.getElementById('pwa-styles')) return;
    const s = document.createElement('style');
    s.id = 'pwa-styles';
    s.textContent = `
      @keyframes pwa-in {
        from { transform: translateX(-50%) translateY(16px); opacity: 0; }
        to   { transform: translateX(-50%) translateY(0);   opacity: 1; }
      }
      #pwa-install-banner button { font-family: inherit; }
    `;
    document.head.appendChild(s);
  }

  function showInstallBanner(type) {
    if (document.getElementById('pwa-install-banner')) return;
    _ensureBannerStyles();

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = BANNER_STYLE;

    if (type === 'ios') {
      banner.innerHTML = `
        <span style="font-size:28px;flex-shrink:0" aria-hidden="true">📱</span>
        <div style="flex:1;min-width:0">
          <div style="color:#F8FAFC;font-weight:700;font-size:14px;margin-bottom:3px">Instalar LIFE OS</div>
          <div style="color:#94A3B8;font-size:12px;line-height:1.4">
            Toque em <strong style="color:#F8FAFC">Compartilhar ↑</strong> e depois
            <strong style="color:#F8FAFC">Adicionar à Tela Inicial</strong>
          </div>
        </div>
        <button onclick="PWA.dismissBanner()"
                style="background:none;border:none;color:#64748B;font-size:24px;cursor:pointer;padding:0 2px;line-height:1;flex-shrink:0"
                aria-label="Fechar">×</button>
      `;
    } else {
      banner.innerHTML = `
        <span style="font-size:28px;flex-shrink:0" aria-hidden="true">⚡</span>
        <div style="flex:1;min-width:0">
          <div style="color:#F8FAFC;font-weight:700;font-size:14px;margin-bottom:3px">Instalar LIFE OS</div>
          <div style="color:#94A3B8;font-size:12px">Acesso rápido como app nativo</div>
        </div>
        <button onclick="PWA.installApp()"
                style="background:#6366F1;border:none;color:#fff;padding:8px 16px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;flex-shrink:0;white-space:nowrap">
          Instalar
        </button>
        <button onclick="PWA.dismissBanner()"
                style="background:none;border:none;color:#64748B;font-size:24px;cursor:pointer;padding:0 2px;line-height:1;flex-shrink:0"
                aria-label="Fechar">×</button>
      `;
    }

    document.body.appendChild(banner);
  }

  // ===== Init =====

  function init() {
    registerSW();
    if (!isStandalone()) captureInstallPrompt();
  }

  return {
    init,
    installApp,
    dismissBanner,
    isIOS,
    isAndroid,
    isStandalone,
    isDesktop,
    getPlatform,
  };
})();

// Auto-init quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PWA.init());
} else {
  PWA.init();
}
