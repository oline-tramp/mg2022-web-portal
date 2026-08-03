function portalApp() {
  return {
    modules: typeof COURSE_DATA !== 'undefined' ? COURSE_DATA : [],
    activeModuleId: null,
    searchQuery: '',
    isMobileMenuOpen: false,

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

    init() {
      if (this.modules.length > 0) {
        this.activeModuleId = this.modules[0].id;
      }
    },

    selectModule(id) {
      this.activeModuleId = id;
      this.isMobileMenuOpen = false;
      this.searchQuery = '';
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
    openPlayer(lessonId, itemIndex) {
      const lesson = this.activeModule.lessons.find(l => l.id === lessonId);
      if (!lesson) return;

      const items = this.getLessonItems(lesson);
      const item = items[itemIndex];
      if (!item) return;

      this.player.isOpen = true;
      this.player.lessonId = lessonId;
      this.player.galleryItems = items;
      this.player.currentIndex = itemIndex;
      this.player.title = `${lesson.title} — ${item.displayTitle}`;
      
      this.player.hasPrev = itemIndex > 0;
      this.player.hasNext = itemIndex < items.length - 1;

      this.player.showTimecodes = (item.type === 'video' || item.type === 'online');
      
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

    closePlayer() {
      this.player.isOpen = false;
      this.player.currentSource = null;
      this.player.sources = [];
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
          const isHttp = window.location.protocol.startsWith('http');
          const localUrl = isHttp ? `/local/${item.data.local_path}` : `/run/media/olinetramp/6F64-7F0F/brin/МГ2022/${item.data.local_path}`;
          sources.push({ label: '💻 Локальный диск', url: localUrl, type: item.type === 'video' ? 'video' : 'iframe' });
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
