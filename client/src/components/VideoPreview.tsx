import useTranslate from '../hooks/useTranslate';

interface VideoPreviewProps {
  src?: string | null;
  title: string;
  variant?: 'inline' | 'icon';
}

const VideoPreview = ({ src, title, variant = 'inline' }: VideoPreviewProps) => {
  const { language, t } = useTranslate();

  if (!src) {
    return <span className="video-placeholder">{t('No video', 'لا يوجد فيديو', 'Sin video')}</span>;
  }

  // Check if the URL is a YouTube link
  const isYouTube = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i.test(src);
  const getYouTubeEmbedUrl = (url: string) => {
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (match && match[1]) {
      return `https://www.youtube.com/embed/${match[1]}`;
    }
    return url;
  };

  // Check if the URL is a Streamable link
  const isStreamable = /streamable\.com\/([a-z0-9]+)/i.test(src);
  const getStreamableEmbedUrl = (url: string) => {
    const match = url.match(/streamable\.com\/([a-z0-9]+)/i);
    if (match && match[1]) {
      return `https://streamable.com/e/${match[1]}`;
    }
    return url;
  };

  const isEmbeddable = isYouTube || isStreamable;

  const openInlineModal = () => {
    const overlay = document.createElement('dialog');
    overlay.className = 'video-modal';

    const container = document.createElement('div');
    container.className = 'video-modal__content';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'video-modal__close';
    closeButton.innerText = '×';
    closeButton.setAttribute('aria-label', 'Close video');

    const closeOverlay = () => {
      overlay.close();
      overlay.remove();
    };

    closeButton.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeOverlay();
      }
    });
    overlay.addEventListener('cancel', closeOverlay);

    if (isEmbeddable) {
      // Use iframe for YouTube or Streamable
      const iframe = document.createElement('iframe');
      iframe.src = isYouTube ? getYouTubeEmbedUrl(src) : getStreamableEmbedUrl(src);
      iframe.title = title;
      iframe.allowFullscreen = true;
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      iframe.className = 'video-modal__player';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      container.appendChild(closeButton);
      container.appendChild(iframe);
    } else {
      // Use video element for direct video URLs
      const video = document.createElement('video');
      video.src = src;
      video.title = title;
      video.controls = true;
      video.autoplay = true;
      video.className = 'video-modal__player';
      const pauseVideo = () => {
        video.pause();
        closeOverlay();
      };
      closeButton.addEventListener('click', pauseVideo);
      container.appendChild(closeButton);
      container.appendChild(video);
    }

    overlay.appendChild(container);
    document.body.appendChild(overlay);
    overlay.showModal();
  };

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className="video-button video-button--icon"
        onClick={openInlineModal}
        aria-label={language === 'ar'
          ? `تشغيل فيديو ${title}`
          : language === 'es'
            ? `Reproducir video de ${title}`
            : `Play ${title} video`}
      >
        <span aria-hidden="true">▶</span>
      </button>
    );
  }

  if (isEmbeddable) {
    return (
      <div className="video-preview">
        <iframe
          src={isYouTube ? getYouTubeEmbedUrl(src) : getStreamableEmbedUrl(src)}
          title={title}
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          className="video-player"
          style={{ width: '100%', aspectRatio: '16/9', border: 'none' }}
        />
      </div>
    );
  }

  return (
    <div className="video-preview">
      <video className="video-player" controls preload="metadata">
        <source src={src} title={title} />
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default VideoPreview;




