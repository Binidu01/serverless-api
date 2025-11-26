import { useEffect } from "react";
import styles from "./page.module.css";

export default function Home() {
  useEffect(() => {
    const darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", darkMode);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        {/* Logo */}
        <div className={styles.logoContainer}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 120 120"
            fill="none"
            className={styles.logo}
            role="img"
            aria-label="Bini.js logo"
          >
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#00CFFF" />
                <stop offset="100%" stopColor="#0077FF" />
              </linearGradient>
            </defs>
            <text
              x="50%"
              y="50%"
              dominantBaseline="middle"
              textAnchor="middle"
              fontFamily="Segoe UI, Arial, sans-serif"
              fontSize="90"
              fontWeight="700"
              fill="url(#grad)"
            >
              ß
            </text>
          </svg>
        </div>

        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>
            Build Better with{" "}
            <span className={styles.accent}>Bini.js</span>
          </h1>
          <p className={styles.subtitle}>
            A modern JavaScript framework designed for simplicity and performance.
            Start building stunning applications in seconds.
          </p>
        </div>

        {/* Features Grid */}
        <div className={styles.grid}>
          {[
            { icon: "⚡", title: "Fast", desc: "Lightning quick performance" },
            { icon: "📦", title: "Lightweight", desc: "Minimal dependencies" },
            { icon: "🎨", title: "Modern", desc: "Latest web standards" },
            { icon: "🚀", title: "Easy", desc: "Simple to get started" }
          ].map((feature) => (
            <div key={feature.title} className={styles.card}>
              <div className={styles.icon}>{feature.icon}</div>
              <h3 className={styles.cardTitle}>{feature.title}</h3>
              <p className={styles.cardText}>{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <div className={styles.ctaCard}>
          <h2 className={styles.ctaTitle}>Ready to Get Started?</h2>
          <p className={styles.ctaText}>
            Explore the possibilities with Bini.js and build faster than ever.
          </p>
          <div className={styles.buttonGroup}>
            <a
              href="https://github.com/Binidu01/bini-examples"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.button}
            >
              View Examples
            </a>
            <a
              href="https://bini.js.org"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.button}
            >
              Documentation
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <p>
            Get started by exploring the{" "}
            <a
              href="https://7jhv5n-3000.csb.app"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              learning center
            </a>
            {" "}or install via{" "}
            <a
              href="https://www.npmjs.com/package/create-bini-app"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              npm
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}