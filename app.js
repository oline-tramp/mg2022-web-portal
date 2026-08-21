function portalApp() {
  return {
    modules: typeof COURSE_DATA !== 'undefined' ? COURSE_DATA : [],
    activeModuleId: null,
    searchQuery: '',
    isMobileMenuOpen: false,
    
    // Swipe handling
    touchStartX: 0,
    touchStart(e) {
      if (e.changedTouches && e.changedTouches.length > 0) {
        this.touchStartX = e.changedTouches[0].screenX;
      }
    },
    touchEnd(e) {
      if (e.changedTouches && e.changedTouches.length > 0) {
        const touchEndX = e.changedTouches[0].screenX;
        if (this.touchStartX - touchEndX > 50) {
          this.isMobileMenuOpen = false;
        }
      }
    },

    // Pull to refresh
    ptrStartY: 0,
    ptrDistance: 0,
    ptrRefreshing: false,
    
    ptrTouchStart(e) {
      const container = document.querySelector('.content-area');
      if (container && container.scrollTop <= 0) {
        this.ptrStartY = e.touches[0].clientY;
      } else {
        this.ptrStartY = 0;
      }
    },
    ptrTouchMove(e) {
      if (!this.ptrStartY || this.ptrRefreshing) return;
      const y = e.touches[0].clientY;
      const dist = y - this.ptrStartY;
      if (dist > 0) {
        this.ptrDistance = Math.min(dist, 100);
        // Only prevent default if we are pulling down significantly
        if (this.ptrDistance > 10 && e.cancelable) {
          e.preventDefault();
        }
      }
    },
    ptrTouchEnd() {
      if (!this.ptrStartY || this.ptrRefreshing) return;
      if (this.ptrDistance > 80) {
        this.ptrRefreshing = true;
        this.ptrDistance = 80;
        this.forceRefresh();
      } else {
        this.ptrDistance = 0;
      }
      this.ptrStartY = 0;
    },
    async forceRefresh() {
      if ('caches' in window) {
        try {
          const names = await caches.keys();
          await Promise.all(names.map(name => caches.delete(name)));
        } catch (e) {}
      }
      window.location.reload(true);
    },

    // Computed properties via getters
    get filteredModules() {
      if (!this.searchQuery) return this.modules;
      const q = this.searchQuery.toLowerCase();
      return this.modules.filter(mod => {
        if (mod.title.toLowerCase().includes(q)) return true;
        return mod.lessons.some(l => l.title.toLowerCase().includes(q));
      });
    },

    get activeModule() {
      return this.modules.find(m => m.id === this.activeModuleId) || null;
    },

    get filteredLessons() {
      if (!this.activeModule) return [];
      if (!this.searchQuery) return this.activeModule.lessons;
      const q = this.searchQuery.toLowerCase();
      return this.activeModule.lessons.filter(l => l.title.toLowerCase().includes(q));
    },

    // Player State
    player: {
      isOpen: false,
      title: '',
      lessonId: null,
      galleryItems: [],
      currentIndex: 0,
      sources: [],
      currentSource: null,
      
      hasPrev: false,
      hasNext: false,

      // Timecode
      showTimecodes: false,
      fileKey: '',
      savedTime: 0,
      bookmarks: []
    },

    updateURL(modId, lesId, itemIdx) {
      const url = new URL(window.location);
      if (modId) url.searchParams.set('m', modId);
      else url.searchParams.delete('m');
      
      if (lesId) url.searchParams.set('l', lesId);
      else url.searchParams.delete('l');
      
      if (itemIdx !== null && itemIdx !== undefined) url.searchParams.set('i', itemIdx);
      else url.searchParams.delete('i');
      
      window.history.pushState({ m: modId, l: lesId, i: itemIdx }, "", url);
    },

    init() {
      const params = new URLSearchParams(window.location.search);
      const urlMod = params.get('m');
      
      if (urlMod && this.modules.some(m => m.id === urlMod)) {
        this.activeModuleId = urlMod;
      } else if (this.modules.length > 0) {
        this.activeModuleId = this.modules[0].id;
      }
      
      const urlLes = params.get('l');
      const urlIdx = params.get('i');
      if (urlLes && urlIdx !== null) {
        setTimeout(() => {
          this.openPlayer(urlLes, parseInt(urlIdx, 10), false);
        }, 100);
      }
      
      window.addEventListener('popstate', (e) => {
        const p = new URLSearchParams(window.location.search);
        const m = p.get('m');
        if (m && m !== this.activeModuleId && this.modules.some(mod => mod.id === m)) {
          this.activeModuleId = m;
        }
        
        const l = p.get('l');
        const i = p.get('i');
        if (l && i !== null) {
          this.openPlayer(l, parseInt(i, 10), false);
        } else if (this.player.isOpen) {
          this.closePlayer(false);
        }
      });
    },

    selectModule(id) {
      this.activeModuleId = id;
      this.isMobileMenuOpen = false;
      this.searchQuery = '';
      this.updateURL(this.activeModuleId, null, null);
    },

    // Helpers
    getEmoji(title) {
      const match = title.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|\S+)/);
      return match ? match[1] : '📁';
    },

    cleanTitle(title) {
      const emoji = this.getEmoji(title);
      return title.replace(emoji, '').trim();
    },

    formatTime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    },

    getMaterialIcon(type) {
      if (type === 'video') return '🎥';
      if (type === 'pdf') return '📄';
      if (type === 'html') return '🌐';
      return '🔗';
    },

    getMaterialMeta(item) {
      if (item.type === 'video') return item.data.duration_fmt || `${item.data.size_mb} MB`;
      if (item.type === 'pdf') return `${item.data.size_mb} MB`;
      if (item.type === 'html') return 'Онлайн-заметка';
      return 'Внешняя ссылка';
    },

    getLessonItems(lesson) {
      const items = [];
      if (lesson.videos) {
        lesson.videos.forEach(v => {
          items.push({ type: 'video', data: v, displayTitle: v.yt_title || v.name });
        });
      }
      if (lesson.pdfs) {
        lesson.pdfs.forEach(p => {
          items.push({ type: 'pdf', data: p, displayTitle: p.name });
        });
      }
      if (lesson.htmls) {
        lesson.htmls.forEach(h => {
          items.push({ type: 'html', data: h, displayTitle: h.name || 'HTML Документ' });
        });
      }
      if (lesson.online_urls) {
        lesson.online_urls.forEach(u => {
          items.push({ type: 'online', data: u, displayTitle: u.title || 'Внешняя ссылка' });
        });
      }
      return items;
    },

    // Player Actions
    openPlayer(lessonId, itemIndex, pushState = true) {
      const lesson = this.activeModule.lessons.find(l => l.id === lessonId);
      if (!lesson) return;

      const items = this.getLessonItems(lesson);
      const item = items[itemIndex];
      if (!item) return;

      this.player.isOpen = true;
      this.player.lessonId = lessonId;
      
      if (pushState) {
        this.updateURL(this.activeModuleId, lessonId, itemIndex);
      }
      this.player.galleryItems = items;
      this.player.currentIndex = itemIndex;
      this.player.title = `${lesson.title} — ${item.displayTitle}`;
      
      this.player.hasPrev = itemIndex > 0;
      this.player.hasNext = itemIndex < items.length - 1;

      const isGithub = window.location.hostname.includes('github.io');
      this.player.showTimecodes = !isGithub && (item.type === 'video' || item.type === 'online');
      
      this.player.fileKey = '';
      if (item.type === 'video') this.player.fileKey = item.data.local_path || item.data.name;
      if (item.type === 'online') this.player.fileKey = item.data.url;

      this.loadBookmarks();

      this.player.sources = this.buildSources(item);
      if (this.player.sources.length > 0) {
        this.setSource(this.player.sources[0]);
      } else {
        this.player.currentSource = null;
      }
    },

    closePlayer(pushState = true) {
      this.player.isOpen = false;
      this.player.currentSource = null;
      this.player.sources = [];
      if (pushState) {
        this.updateURL(this.activeModuleId, null, null);
      }
    },

    refreshPlayer() {
      if (this.player.currentSource) {
        const source = this.player.currentSource;
        this.player.currentSource = null;
        setTimeout(() => {
          this.player.currentSource = source;
        }, 50);
      }
    },

    prevItem() {
      if (this.player.hasPrev) {
        this.openPlayer(this.player.lessonId, this.player.currentIndex - 1);
      }
    },

    nextItem() {
      if (this.player.hasNext) {
        this.openPlayer(this.player.lessonId, this.player.currentIndex + 1);
      }
    },

    buildSources(item) {
      const sources = [];
      
      if (item.type === 'video') {
        if (item.data.matched_urls && item.data.matched_urls.length > 0) {
          item.data.matched_urls.forEach((src, idx) => {
            let label = '🌐 Ссылка';
            let url = src.url;
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
              label = '🟥 YouTube Видео';
              const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
              if (m) url = `https://www.youtube.com/embed/${m[1]}?autoplay=1`;
            }
            sources.push({ label: `${label} ${idx > 0 ? idx+1 : ''}`, url: url, type: 'iframe' });
          });
        }
      }

      if (item.type === 'video' || item.type === 'pdf' || item.type === 'html') {
        if (item.data.gdrive_id) {
          sources.push({ label: '☁️ Google Drive', url: `https://drive.google.com/file/d/${item.data.gdrive_id}/preview`, type: 'iframe' });
        }
        if (item.data.local_path) {
          const isGithub = window.location.hostname.includes('github.io');
          if (!isGithub) {
            const isHttp = window.location.protocol.startsWith('http');
            const localUrl = isHttp ? `/local/${item.data.local_path}` : `/run/media/olinetramp/6F64-7F0F/brin/МГ2022/${item.data.local_path}`;
            sources.push({ label: '💻 Локальный диск', url: localUrl, type: item.type === 'video' ? 'video' : 'iframe' });
          }
        }
      }

      if (item.type === 'online') {
        let url = item.data.url;
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
          const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
          if (m) {
            sources.push({ label: '🟥 YouTube Видео', url: `https://www.youtube.com/embed/${m[1]}?autoplay=1`, type: 'iframe' });
          } else {
            sources.push({ label: '🟥 YouTube Ссылка', url: url, type: 'iframe' });
          }
        } else if (url.includes('drive.google.com')) {
          const m = url.match(/\/d\/([^\/]+)/) || url.match(/[?&]id=([^&]+)/);
          if (m) {
            sources.push({ label: '☁️ Google Drive', url: `https://drive.google.com/file/d/${m[1]}/preview`, type: 'iframe' });
          } else {
            sources.push({ label: '☁️ Внешняя ссылка', url: url, type: 'iframe' });
          }
        } else {
          sources.push({ label: '☁️ Внешняя ссылка', url: url, type: 'iframe' });
        }
      }

      return sources;
    },

    setSource(source) {
      this.player.currentSource = source;
    },

    // Bookmarks and Timecodes
    loadBookmarks() {
      if (!this.player.fileKey) return;
      try {
        const savedTime = localStorage.getItem(this.player.fileKey);
        this.player.savedTime = savedTime ? parseFloat(savedTime) : 0;
        
        const bms = localStorage.getItem(this.player.fileKey + "_bookmarks");
        this.player.bookmarks = bms ? JSON.parse(bms) : [];
      } catch (e) {
        console.error("Storage error", e);
      }
    },

    saveBookmarksToStorage() {
      if (!this.player.fileKey) return;
      localStorage.setItem(this.player.fileKey + "_bookmarks", JSON.stringify(this.player.bookmarks));
    },

    getCurrentVideoTime() {
      const container = document.querySelector('.player-container');
      if (!container) return 0;
      const video = container.querySelector('video');
      if (video) return video.currentTime;
      return 0; // iFrame (YouTube) time cannot be easily extracted here without YouTube API
    },

    saveCurrentTimecode() {
      const time = this.getCurrentVideoTime();
      if (time > 0 && this.player.fileKey) {
        this.player.savedTime = time;
        localStorage.setItem(this.player.fileKey, time.toString());
        alert("Время сохранено!");
      } else {
        alert("Не удалось определить время (возможно это iframe без API)");
      }
    },

    jumpToSavedTime() {
      this.jumpToTime(this.player.savedTime);
    },

    jumpToTime(time) {
      const container = document.querySelector('.player-container');
      if (!container) return;
      const video = container.querySelector('video');
      if (video) {
        video.currentTime = time;
        video.play();
      } else {
        alert("Быстрый переход работает только для локальных видео.");
      }
    },

    addBookmark() {
      const time = this.getCurrentVideoTime();
      const note = prompt("Введите описание закладки:");
      if (note && note.trim() !== '') {
        this.player.bookmarks.push({
          id: Date.now().toString(),
          time: time,
          note: note.trim()
        });
        this.player.bookmarks.sort((a, b) => a.time - b.time);
        this.saveBookmarksToStorage();
      }
    },

    deleteBookmark(id) {
      if (confirm("Удалить закладку?")) {
        this.player.bookmarks = this.player.bookmarks.filter(b => b.id !== id);
        this.saveBookmarksToStorage();
      }
    }
  }
}
