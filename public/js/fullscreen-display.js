// 专用于画屏显示的优化脚本

let displayImageCache = new Map();
let displayCacheSize = 0;
const MAX_DISPLAY_CACHE_SIZE = 15;  // 降低专用显示缓存

async function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`图片加载失败: ${src}`));
    img.src = src;
  });
}

async function transitionImage(newImageSrc) {
  const currentImage = document.getElementById('coverImage');
  const nextImage = document.getElementById('nextCoverImage');
  
  try {
    // 预加载新图片
    const img = await preloadImage(newImageSrc);
    
    // 缓存管理
    if (!displayImageCache.has(newImageSrc)) {
      if (displayCacheSize >= MAX_DISPLAY_CACHE_SIZE) {
        const firstKey = displayImageCache.keys().next().value;
        const oldImg = displayImageCache.get(firstKey);
        // 清理旧图片资源
        if (oldImg) {
          oldImg.src = '';
          oldImg.onload = null;
          oldImg.onerror = null;
        }
        displayImageCache.delete(firstKey);
        displayCacheSize--;
      }
      displayImageCache.set(newImageSrc, img);
      displayCacheSize++;
    }
    
    // 设置新图片
    nextImage.src = newImageSrc;
    nextImage.style.opacity = '0';
    
    // 显示新图片层
    nextImage.style.visibility = 'visible';
    nextImage.style.zIndex = '2';
    
    // 执行交叉淡入淡出
    await new Promise(resolve => {
      const handleTransitionEnd = () => {
        nextImage.removeEventListener('transitionend', handleTransitionEnd);
        // 完成过渡后，交换图片角色
        currentImage.src = newImageSrc;
        currentImage.style.opacity = '1';
        nextImage.style.visibility = 'hidden';
        nextImage.style.zIndex = '1';
        resolve();
      };
      
      nextImage.addEventListener('transitionend', handleTransitionEnd);
      requestAnimationFrame(() => {
        nextImage.style.transition = 'opacity 0.8s ease-out';
        nextImage.style.opacity = '1';
      });
    });
  } catch (error) {
    console.error('图片切换失败:', error);
  }
}

// 性能监控
let lastTime = performance.now();
let frameCount = 0;
let fps = 0;

function measurePerformance() {
  frameCount++;
  const currentTime = performance.now();
  
  if (currentTime - lastTime >= 1000) {
    fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
    frameCount = 0;
    lastTime = currentTime;
    
    // 内存使用监控
    if ('memory' in performance) {
      const memory = performance.memory;
      const usedMB = Math.round(memory.usedJSHeapSize / 1048576);
      
      // 性能预警
      if (fps < 30 || usedMB > 100) {
        console.warn(`性能预警: FPS=${fps}, 内存=${usedMB}MB`);
      }
    }
  }
  
  requestAnimationFrame(measurePerformance);
}

// 启动性能监控
measurePerformance();