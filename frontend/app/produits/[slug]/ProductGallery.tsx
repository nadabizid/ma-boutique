'use client';

import { useState } from 'react';
import { imageUrl } from '@/lib/api';

export default function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [current, setCurrent] = useState(0);
  if (images.length === 0) {
    return (
      <div className="aspect-square bg-surface flex items-center justify-center">
        <span className="font-display italic text-ink/30">{name}</span>
      </div>
    );
  }
  return (
    <div>
      <div className="aspect-square bg-surface overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl(images[current])} alt={name} className="w-full h-full object-cover" />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto">
          {images.map((u, i) => (
            <button
              key={u}
              onClick={() => setCurrent(i)}
              aria-label={`Image ${i + 1}`}
              className={`w-16 h-16 flex-shrink-0 bg-surface overflow-hidden border-2 ${i === current ? 'border-forest' : 'border-transparent'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(u)} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
