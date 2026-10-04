'use client';

import React from 'react';
import './BritLoader.css';

interface BritLoaderProps {
  fullPage?: boolean;
  text?: string;
  subtitle?: string;
}

export default function BritLoader({
  fullPage = false,
  text = 'BRIT SPORT GROUP',
  subtitle = 'Loading Management Room',
}: BritLoaderProps) {
  if (fullPage) {
    return (
      <div className="brit-loader-fullpage">
        <div className="brit-loader-fullpage-overlay" />
        <div className="brit-loader-container">
          <div className="brit-orb brit-orb-1" />
          <div className="brit-orb brit-orb-2" />
          <div className="brit-shimmer-line" />

          <div className="brit-spinner">
            <div className="brit-ring" />
            <div className="brit-ring" />
            <div className="brit-ring" />
            <div className="brit-core" />
          </div>

          <div className="brit-loader-text">
            <div className="brit-loader-title">{text}</div>
            <div className="brit-loader-subtitle">{subtitle}</div>
            <div className="brit-dots">
              <div className="brit-dot" />
              <div className="brit-dot" />
              <div className="brit-dot" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="brit-loader-container">
      <div className="brit-orb brit-orb-1" />
      <div className="brit-orb brit-orb-2" />
      <div className="brit-shimmer-line" />

      <div className="brit-spinner">
        <div className="brit-ring" />
        <div className="brit-ring" />
        <div className="brit-ring" />
        <div className="brit-core" />
      </div>

      <div className="brit-loader-text">
        <div className="brit-loader-title">{text}</div>
        <div className="brit-loader-subtitle">{subtitle}</div>
        <div className="brit-dots">
          <div className="brit-dot" />
          <div className="brit-dot" />
          <div className="brit-dot" />
        </div>
      </div>
    </div>
  );
}
