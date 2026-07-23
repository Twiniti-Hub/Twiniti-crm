import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">T</span><span>Twiniti CRM</span></div>
        <nav>
          <a className="active" href="#overview">Overview</a>
          <a href="#contacts">Contacts</a>
          <a href="#segments">Segments</a>
          <a href="#campaigns">Campaigns</a>
          <a href="#workflows">Workflows</a>
          <a href="#agents">Agents</a>
        </nav>
        <div className="sidebar-footer"><span className="status-dot" /> API scaffold online</div>
      </aside>
      <section className="content">
        <header className="topbar"><div><p className="eyebrow">Marketing workspace</p><h1>Good morning, George</h1></div><button className="avatar">GB</button></header>
        <section className="hero-card">
          <div><p className="eyebrow accent">Agent-native CRM</p><h2>Your customer context, ready to act.</h2><p className="hero-copy">Manage contacts, launch thoughtful campaigns, and give your marketing agents safe tools to do the work.</p><div className="hero-actions"><button className="primary">Add contact</button><button className="secondary">Explore agent tools</button></div></div>
          <div className="hero-orbit"><div className="orbit-center">CRM</div><span className="orbit-chip chip-one">Contacts</span><span className="orbit-chip chip-two">Campaigns</span><span className="orbit-chip chip-three">Agents</span></div>
        </section>
        <div className="section-heading"><div><p className="eyebrow">Workspace pulse</p><h2>Make the next move clear</h2></div><button className="quiet">View reports →</button></div>
        <section className="metrics"><article><span className="metric-label">Total contacts</span><strong>—</strong><small>Connect Neon to load data</small></article><article><span className="metric-label">Active segments</span><strong>—</strong><small>Dynamic audiences will appear here</small></article><article><span className="metric-label">Campaign health</span><strong>Ready</strong><small>Resend delivery layer configured</small></article></section>
        <section className="split"><article className="panel"><div className="panel-heading"><div><p className="eyebrow">Agent operations</p><h3>Safe actions, visible outcomes</h3></div><span className="pill">7 tools</span></div><div className="tool-list"><div><span className="tool-icon">⌕</span><span><b>Search contacts</b><small>Read scoped customer context</small></span><em>read</em></div><div><span className="tool-icon">＋</span><span><b>Upsert contact</b><small>Validate and prevent duplicates</small></span><em>write</em></div><div><span className="tool-icon">✦</span><span><b>Preview campaign</b><small>Check consent before approval</small></span><em>review</em></div></div></article><article className="panel warm"><p className="eyebrow">Build status</p><h3>Foundation scaffolded</h3><p>The React shell, Fastify API, shared contracts, and Neon schema are ready for the next implementation slice.</p><div className="progress"><span style={{ width: "28%" }} /></div><small>28% of the initial foundation</small></article></section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
