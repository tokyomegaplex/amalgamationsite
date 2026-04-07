/* ═══════════════════════════════════════════════════════
   AMALGAMATION NETWORK — Interactive Force Graph
   ═══════════════════════════════════════════════════════ */

(function () {
  const { PEOPLE, CONNECTIONS, PROJECTS, CATEGORY_COLORS, TIER_CONFIG } = window.NETWORK_DATA;

  // ─── State ─────────────────────────────────────────
  let activeTag = null;
  let searchQuery = "";
  let hoveredNode = null;
  let selectedNode = null;
  let activeProject = null;
  let gridMode = null; // null, "alpha", "followers"
  let transform = { x: 0, y: 0, k: 1 };
  let dragging = null;
  let dragOffset = { x: 0, y: 0 };
  let drawScheduled = false;
  let dpr = 1;

  // ─── Canvas Setup ──────────────────────────────────
  const canvas = document.getElementById("graph-canvas");
  const ctx = canvas.getContext("2d");
  let width, height;

  function resize() {
    const container = document.getElementById("graph-container");
    dpr = window.devicePixelRatio || 1;
    width = container.clientWidth;
    height = container.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    scheduleDraw();
  }

  // RAF-based drawing to prevent overlapping paint calls
  function scheduleDraw() {
    if (!drawScheduled) {
      drawScheduled = true;
      requestAnimationFrame(() => {
        drawScheduled = false;
        draw();
      });
    }
  }

  window.addEventListener("resize", () => { resize(); });
  resize();

  // ─── Build Nodes & Links ───────────────────────────
  const nodes = PEOPLE.map((p, i) => ({
    ...p,
    x: width / 2 + (Math.random() - 0.5) * 400,
    y: height / 2 + (Math.random() - 0.5) * 400,
    vx: 0,
    vy: 0,
    primaryColor: CATEGORY_COLORS[p.tags[0]] || "#888",
  }));

  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.id] = n);

  const maxFollowers = Math.max(1, ...nodes.map(n => n.followers || 0));

  // ─── Preload Profile Pics ─────────────────────────
  const nodeImages = {};
  nodes.forEach(n => {
    const img = new Image();
    img.src = "img/" + n.id + ".jpg";
    img.onload = function () { nodeImages[n.id] = img; scheduleDraw(); };
    img.onerror = function () { /* no pic, fall back to colored circle */ };
  });

  // ─── Amalgamation Video Node ───────────────────────
  const amalgamationVideo = document.createElement("video");
  amalgamationVideo.src = "img/amalgamation.mp4";
  amalgamationVideo.loop = true;
  amalgamationVideo.muted = true;
  amalgamationVideo.playsInline = true;
  amalgamationVideo.autoplay = true;
  amalgamationVideo.style.display = "none";
  document.body.appendChild(amalgamationVideo);
  amalgamationVideo.play().catch(() => {});
  // Drive continuous redraws while video is playing
  (function videoTick() {
    if (!amalgamationVideo.paused) scheduleDraw();
    requestAnimationFrame(videoTick);
  })();

  const links = CONNECTIONS.map(c => ({
    source: nodeMap[c.source],
    target: nodeMap[c.target],
    strength: c.strength,
    label: c.label,
  })).filter(l => l.source && l.target);

  // ─── Force Simulation ──────────────────────────────
  const simulation = d3.forceSimulation(nodes)
    .force("charge", d3.forceManyBody().strength(n => {
      const r = TIER_CONFIG[n.tier]?.radius || 7;
      if (n.id === "amalgamation") return -r * 4 * 40; // oval is 4x wider, needs strong repulsion
      if (n.id === "chris-rutledge") return -r * 10;
      if (n.tier === "core") return -r * 30;
      if (n.tier === "go-to") return -r * 25;
      return -r * 20;
    }))
    .force("center", d3.forceCenter(width / 2, height / 2).strength(0.008))
    .force("link", d3.forceLink(links).id(d => d.id).distance(l => {
      // More space between linked nodes
      if (l.strength === 3) return 120;
      if (l.strength === 2) return 180;
      return 250;
    }).strength(l => {
      // weaker link pull toward chris so he doesn't suck everything in
      const srcId = typeof l.source === "object" ? l.source.id : l.source;
      const tgtId = typeof l.target === "object" ? l.target.id : l.target;
      if (srcId === "chris-rutledge" || tgtId === "chris-rutledge") return l.strength * 0.06;
      return l.strength * 0.15;
    }))
    .force("collision", d3.forceCollide(n => {
      const r = TIER_CONFIG[n.tier]?.radius || 7;
      if (n.id === "amalgamation") return r * 4 + 20; // Large oval needs more clearance
      return r + 12; // More padding between nodes
    }))
    .force("x", d3.forceX(width / 2).strength(0.006))
    .force("y", d3.forceY(height / 2).strength(0.006))
    .alphaDecay(0.006)
    .on("tick", scheduleDraw);

  // ─── Fuzzy Search ──────────────────────────────────
  function editDistance(a, b) {
    if (a.length > b.length) { var t = a; a = b; b = t; }
    var row = [];
    for (var i = 0; i <= a.length; i++) row[i] = i;
    for (var j = 1; j <= b.length; j++) {
      var prev = row[0];
      row[0] = j;
      for (var i = 1; i <= a.length; i++) {
        var val = Math.min(row[i] + 1, row[i-1] + 1, prev + (a[i-1] === b[j-1] ? 0 : 1));
        prev = row[i];
        row[i] = val;
      }
    }
    return row[a.length];
  }

  function fuzzyWordMatch(qw, textWords) {
    // Exact word match in text
    for (var j = 0; j < textWords.length; j++) {
      if (textWords[j] === qw) return true;
      // Substring: query word found inside a text word (but query must be 3+ chars)
      if (qw.length >= 3 && textWords[j].includes(qw)) return true;
    }
    // Typo tolerance: edit distance 1 for short words (4-5 chars), 2 for longer words (6+)
    var maxDist = qw.length >= 6 ? 2 : 1;
    if (qw.length >= 4) {
      for (var j = 0; j < textWords.length; j++) {
        if (textWords[j].length >= 4 && Math.abs(textWords[j].length - qw.length) <= maxDist) {
          if (editDistance(qw, textWords[j]) <= maxDist) return true;
        }
      }
    }
    return false;
  }

  // ─── Filtering ─────────────────────────────────────
  function isNodeVisible(node) {
    if (activeTag && !node.tags.includes(activeTag)) return false;
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      var haystack = [
        node.name, node.aka, node.role, node.org,
        node.description, ...node.tags
      ].filter(Boolean).join(" ").toLowerCase();
      // Fast path: exact substring
      if (haystack.includes(q)) return true;
      // Word-level fuzzy: all query words must match
      var words = q.split(/\s+/).filter(Boolean);
      var textWords = haystack.split(/[\s,./\-()]+/).filter(Boolean);
      var allMatch = words.every(function(w) { return fuzzyWordMatch(w, textWords); });
      if (!allMatch) return false;
    }
    return true;
  }

  // Build adjacency set for selected node
  function getSelectedNeighbors() {
    if (!selectedNode) return null;
    var neighbors = new Set();
    neighbors.add(selectedNode.id);
    CONNECTIONS.forEach(function(c) {
      if (c.source === selectedNode.id || c.source.id === selectedNode.id) {
        neighbors.add(typeof c.target === "object" ? c.target.id : c.target);
      }
      if (c.target === selectedNode.id || c.target.id === selectedNode.id) {
        neighbors.add(typeof c.source === "object" ? c.source.id : c.source);
      }
    });
    return neighbors;
  }

  function getNodeOpacity(node) {
    if (activeProject) {
      return activeProject.people.includes(node.id) ? 1.0 : 0.06;
    }
    if (selectedNode && !activeTag && !searchQuery) {
      var neighbors = getSelectedNeighbors();
      return neighbors.has(node.id) ? 1.0 : 0.08;
    }
    if (!activeTag && !searchQuery) return TIER_CONFIG[node.tier]?.opacity || 0.8;
    return isNodeVisible(node) ? 1.0 : 0.08;
  }

  // ─── SDF Metaball Offscreen Buffer ─────────────────
  const metaCanvas = document.createElement("canvas");
  const metaCtx = metaCanvas.getContext("2d", { willReadFrequently: true });

  function parseHex(hex) {
    hex = normalizeHex(hex);
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }

  // Group nodes by color bucket for metaball blending
  function getColorBucket(hex) {
    // Quantize to reduce unique groups
    const [r, g, b] = parseHex(hex);
    return `${Math.round(r/32)*32},${Math.round(g/32)*32},${Math.round(b/32)*32}`;
  }

  function drawMetaballs() {
    // Figure out world-space bounding box visible on screen
    const worldLeft = -transform.x / transform.k;
    const worldTop = -transform.y / transform.k;
    const worldW = width / transform.k;
    const worldH = height / transform.k;

    // Scale metaball buffer for performance (half res)
    const scale = Math.min(1, transform.k * 0.5);
    const bufW = Math.ceil(worldW * scale);
    const bufH = Math.ceil(worldH * scale);

    if (bufW <= 0 || bufH <= 0) return;
    metaCanvas.width = bufW;
    metaCanvas.height = bufH;
    metaCtx.clearRect(0, 0, bufW, bufH);

    // Group visible nodes by color
    const groups = {};
    nodes.forEach(node => {
      const opacity = getNodeOpacity(node);
      if (opacity < 0.15) return;
      const config = TIER_CONFIG[node.tier] || TIER_CONFIG.network;
      const r = config.radius;
      const bucket = getColorBucket(node.primaryColor);
      if (!groups[bucket]) groups[bucket] = { color: node.primaryColor, nodes: [] };
      groups[bucket].nodes.push({ node, r, opacity });
    });

    // For each color group, draw soft radial blobs and threshold
    Object.values(groups).forEach(group => {
      metaCtx.clearRect(0, 0, bufW, bufH);
      metaCtx.globalCompositeOperation = "source-over";

      group.nodes.forEach(({ node, r, opacity }) => {
        if (isNaN(node.x) || isNaN(node.y)) return;
        const sx = (node.x - worldLeft) * scale;
        const sy = (node.y - worldTop) * scale;
        const sr = r * scale * 3.5; // blob radius (bigger = more blobbing)

        const grad = metaCtx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        grad.addColorStop(0, `rgba(255,255,255,${opacity * 0.9})`);
        grad.addColorStop(0.4, `rgba(255,255,255,${opacity * 0.5})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        metaCtx.fillStyle = grad;
        metaCtx.beginPath();
        metaCtx.arc(sx, sy, sr, 0, Math.PI * 2);
        metaCtx.fill();
      });

      // Read pixels and threshold to create blob shapes
      if (bufW > 0 && bufH > 0) {
        const imageData = metaCtx.getImageData(0, 0, bufW, bufH);
        const data = imageData.data;
        const [cr, cg, cb] = parseHex(group.color);
        const threshold = 80; // alpha threshold for blob edge

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a > threshold) {
            // Inside blob — set to group color with soft alpha
            const blobAlpha = Math.min(255, (a - threshold) * 3);
            data[i] = cr;
            data[i + 1] = cg;
            data[i + 2] = cb;
            data[i + 3] = Math.floor(blobAlpha * 0.35); // soft blob fill
          } else {
            data[i + 3] = 0;
          }
        }
        metaCtx.putImageData(imageData, 0, 0);

        // Draw the thresholded blob onto main canvas
        ctx.globalAlpha = 0.6;
        ctx.drawImage(metaCanvas, worldLeft, worldTop, worldW, worldH);
        ctx.globalAlpha = 1;
      }
    });
  }

  // ─── Drawing ───────────────────────────────────────
  function draw() {
    // Reset to identity, clear entire canvas buffer, then apply DPR + view transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    // Draw SDF metaball blobs behind everything
    if (!gridMode) drawMetaballs();

    // Draw links (skip in alphabetical mode, skip if either endpoint has invalid coords)
    if (!gridMode)
    links.forEach(link => {
      const sx = link.source.x, sy = link.source.y;
      const tx = link.target.x, ty = link.target.y;
      if (isNaN(sx) || isNaN(sy) || isNaN(tx) || isNaN(ty)) return;

      const sVis = isNodeVisible(link.source);
      const tVis = isNodeVisible(link.target);
      const bothVisible = sVis && tVis;
      const anyVisible = sVis || tVis;

      const baseAlpha = link.strength === 3 ? 0.2 : link.strength === 2 ? 0.1 : 0.04;
      let alpha;
      if (activeProject) {
        const sPr = activeProject.people.includes(link.source.id);
        const tPr = activeProject.people.includes(link.target.id);
        alpha = (sPr && tPr) ? 0.6 : (sPr || tPr) ? 0.03 : 0.01;
      } else if (selectedNode && !activeTag && !searchQuery) {
        const sSel = link.source.id === selectedNode.id;
        const tSel = link.target.id === selectedNode.id;
        alpha = (sSel || tSel) ? 0.7 : 0.02;
      } else if (activeTag || searchQuery) {
        alpha = bothVisible ? baseAlpha * 3 : anyVisible ? baseAlpha * 0.3 : 0.01;
      } else {
        alpha = baseAlpha;
      }

      // Hide very faint links when zoomed out
      if (alpha < 0.03 && transform.k < 0.8) return;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      const isSelectedLink = selectedNode && !activeTag && !searchQuery && (link.source.id === selectedNode.id || link.target.id === selectedNode.id);
      ctx.strokeStyle = isSelectedLink
        ? `rgba(${parseHex(selectedNode.primaryColor).join(",")}, ${alpha})`
        : `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = isSelectedLink ? 2 : (link.strength === 3 ? 1.5 : link.strength === 2 ? 0.8 : 0.4);

      if (link.strength === 1) ctx.setLineDash([3, 5]);
      else ctx.setLineDash([]);

      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw nodes
    nodes.forEach(node => {
      if (isNaN(node.x) || isNaN(node.y)) return;

      const config = TIER_CONFIG[node.tier] || TIER_CONFIG.network;
      let r;
      if (gridMode === "followers") {
        var f = node.followers || 0;
        r = f > 0 ? Math.max(4, Math.min(30, 4 + Math.sqrt(f / maxFollowers) * 26)) : 4;
      } else if (gridMode) {
        r = Math.min(config.radius, 8);
      } else {
        r = config.radius;
      }
      const opacity = getNodeOpacity(node);
      const isHovered = hoveredNode === node;
      const isSelected = selectedNode === node;
      const isAmalgamation = node.id === "amalgamation";
      // Oval dimensions: amalgamation gets a wide ellipse, others stay circular
      const rx = isAmalgamation ? r * 4 : r;
      const ry = isAmalgamation ? r * 2.5 : r;
      const glowR = Math.max(rx, ry);

      ctx.globalAlpha = opacity;

      // Glow for core/go-to
      if ((config.glow || isHovered || isSelected || isAmalgamation) && opacity > 0.3) {
        const gradient = ctx.createRadialGradient(node.x, node.y, glowR * 0.5, node.x, node.y, glowR * 2.5);
        gradient.addColorStop(0, isAmalgamation ? "rgba(255,215,0,0.18)" : hexToRgba(node.primaryColor, 0.25));
        gradient.addColorStop(1, "transparent");
        ctx.beginPath();
        if (isAmalgamation) {
          ctx.ellipse(node.x, node.y, rx * 2.5, ry * 2.5, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(node.x, node.y, r * 2.5, 0, Math.PI * 2);
        }
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Ring for selected
      if (isSelected) {
        ctx.beginPath();
        if (isAmalgamation) {
          ctx.ellipse(node.x, node.y, rx + 4, ry + 4, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        }
        ctx.strokeStyle = node.primaryColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Node circle — video (amalgamation), profile pic, or gradient fill
      const profileImg = nodeImages[node.id];
      const videoReady = isAmalgamation && amalgamationVideo.readyState >= 2;
      if ((videoReady || profileImg) && r >= 6) {
        // Draw clipped image/video (oval for amalgamation, circle otherwise)
        ctx.save();
        ctx.beginPath();
        if (isAmalgamation) {
          ctx.ellipse(node.x, node.y, rx, ry, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        }
        ctx.clip();
        if (videoReady) {
          ctx.drawImage(amalgamationVideo, node.x - rx, node.y - ry, rx * 2, ry * 2);
        } else {
          ctx.drawImage(profileImg, node.x - r, node.y - r, r * 2, r * 2);
        }
        ctx.restore();

        // Border — gold glow for amalgamation
        ctx.beginPath();
        if (isAmalgamation) {
          ctx.ellipse(node.x, node.y, rx, ry, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        }
        ctx.strokeStyle = isAmalgamation
          ? (isHovered ? "#ffffff" : "rgba(255,215,0,0.9)")
          : isHovered
            ? "#ffffff"
            : `rgba(255, 255, 255, ${node.tier === "core" ? 0.6 : 0.25})`;
        ctx.lineWidth = isAmalgamation ? 2.5 : isHovered ? 2 : 1;
        ctx.stroke();
      } else {
        // Fallback: gradient circle with initials
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);

        const grad = ctx.createRadialGradient(
          node.x - r * 0.3, node.y - r * 0.3, 0,
          node.x, node.y, r
        );
        grad.addColorStop(0, lightenColor(node.primaryColor, 30));
        grad.addColorStop(1, node.primaryColor);
        ctx.fillStyle = grad;
        ctx.fill();

        // Border
        ctx.strokeStyle = isHovered
          ? "#ffffff"
          : `rgba(255, 255, 255, ${node.tier === "core" ? 0.5 : 0.15})`;
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.stroke();

        // Initials
        if (r >= 9) {
          ctx.fillStyle = "#0a0a0f";
          ctx.font = `${Math.max(8, r * 0.6)}px 'Space Grotesk', sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const initials = node.name.split(/[\s&]+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
          ctx.fillText(initials, node.x, node.y + 1);
        }
      }

      // Label — show based on tier and zoom level
      let showLabel;
      if (gridMode) {
        showLabel = true;
      } else if (isHovered || isSelected) {
        showLabel = true;
      } else if (node.tier === "core") {
        showLabel = transform.k > 0.4;
      } else if (node.tier === "go-to") {
        showLabel = transform.k > 0.6;
      } else if (node.tier === "network") {
        showLabel = transform.k > 1.0;
      } else {
        showLabel = transform.k > 1.3; // orgs, clients, festivals
      }
      if (opacity > 0.3 && showLabel) {
        ctx.fillStyle = `rgba(232, 232, 240, ${opacity * 0.9})`;
        var fontSize = gridMode ? 8 : Math.max(10, 11);
        var fontWeight = node.tier === "core" && !gridMode ? "600" : "400";
        ctx.font = `${fontWeight} ${fontSize}px 'Space Grotesk', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(node.name, node.x, node.y + ry + (gridMode ? 3 : 6));
      }

      ctx.globalAlpha = 1;
    });

    ctx.restore();
  }

  // ─── Color Helpers ─────────────────────────────────
  // Normalize short hex (#abc) to full hex (#aabbcc)
  function normalizeHex(hex) {
    if (hex.length === 4) {
      return "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return hex;
  }

  function lightenColor(hex, percent) {
    hex = normalizeHex(hex);
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (num >> 16) + percent);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
    const b = Math.min(255, (num & 0x0000FF) + percent);
    return `rgb(${r},${g},${b})`;
  }

  function hexToRgba(hex, alpha) {
    hex = normalizeHex(hex);
    const num = parseInt(hex.slice(1), 16);
    return `rgba(${(num >> 16) & 0xff},${(num >> 8) & 0xff},${num & 0xff},${alpha})`;
  }

  // ─── Interaction ───────────────────────────────────
  function screenToWorld(sx, sy) {
    return {
      x: (sx - transform.x) / transform.k,
      y: (sy - transform.y) / transform.k,
    };
  }

  function getNodeAt(sx, sy) {
    const { x, y } = screenToWorld(sx, sy);
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const r = (TIER_CONFIG[n.tier]?.radius || 10) + 4;
      const dx = n.x - x, dy = n.y - y;
      if (dx * dx + dy * dy < r * r) return n;
    }
    return null;
  }

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragging) {
      const { x, y } = screenToWorld(sx, sy);
      dragging.fx = x;
      dragging.fy = y;
      simulation.alpha(0.1).restart();
      return;
    }

    const node = getNodeAt(sx, sy);
    hoveredNode = node;
    canvas.style.cursor = node ? "pointer" : "grab";
    scheduleDraw();
  });

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const node = getNodeAt(sx, sy);

    if (node) {
      dragging = node;
      node.fx = node.x;
      node.fy = node.y;
      simulation.alphaTarget(0.3).restart();
    } else {
      // Pan
      dragOffset = { x: e.clientX - transform.x, y: e.clientY - transform.y };
      const onMove = (e2) => {
        transform.x = e2.clientX - dragOffset.x;
        transform.y = e2.clientY - dragOffset.y;
        scheduleDraw();
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
  });

  canvas.addEventListener("mouseup", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const node = getNodeAt(sx, sy);

    if (dragging) {
      // If we didn't move much, treat as click
      if (node && node === dragging) {
        selectNode(node);
      } else if (!node) {
        // Clicked blank space — deselect
        selectedNode = null;
        panel.classList.add("hidden");
        scheduleDraw();
      }

      dragging.fx = null;
      dragging.fy = null;
      dragging = null;
      simulation.alphaTarget(0);
    } else if (!node) {
      // Clicked blank space without dragging — deselect
      selectedNode = null;
      panel.classList.add("hidden");
      scheduleDraw();
    }
  });

  // Zoom
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const delta = -e.deltaY * 0.001;
    const newK = Math.max(0.2, Math.min(4, transform.k * (1 + delta)));
    const ratio = newK / transform.k;

    transform.x = mx - (mx - transform.x) * ratio;
    transform.y = my - (my - transform.y) * ratio;
    transform.k = newK;

    scheduleDraw();
  }, { passive: false });

  // ─── Info Panel ────────────────────────────────────
  const panel = document.getElementById("info-panel");
  const panelContent = document.getElementById("panel-content");
  const panelClose = document.getElementById("panel-close");

  panelClose.addEventListener("click", () => {
    panel.classList.add("hidden");
    selectedNode = null;
    scheduleDraw();
  });

  function selectNode(node) {
    selectedNode = node;
    panel.classList.remove("hidden");

    let html = "";
    // Profile pic in info panel
    const hasImg = nodeImages[node.id];
    if (hasImg) {
      html += `<div style="text-align:center; margin-bottom:12px;"><img src="img/${node.id}.jpg" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid ${node.primaryColor};"></div>`;
    }
    html += `<span class="panel-tier ${node.tier}">${node.tier.replace("-", " ")}</span>`;
    html += `<div class="panel-name">${node.name}</div>`;
    if (node.aka) html += `<div class="panel-aka">aka ${node.aka}</div>`;
    if (node.role) html += `<div class="panel-role">${node.role}</div>`;
    if (node.org) html += `<div class="panel-org">${node.org}</div>`;
    if (node.location) html += `<div class="panel-role" style="opacity:0.6;">📍 ${node.location}</div>`;
    if (node.followers) html += `<div class="panel-followers">${formatNumber(node.followers)} followers</div>`;
    if (node.description) html += `<div class="panel-desc">${node.description}</div>`;

    html += `<div class="panel-tags">`;
    node.tags.forEach(t => {
      const color = CATEGORY_COLORS[t] || "#888";
      html += `<span class="panel-tag" style="border-color:${color}; color:${color}">${t}</span>`;
    });
    html += `</div>`;

    // Links
    const linksHtml = [];
    if (node.website) linksHtml.push(`<a class="panel-link" href="${node.website}" target="_blank">🔗 ${node.website}</a>`);
    if (node.instagram) linksHtml.push(`<a class="panel-link" href="https://instagram.com/${node.instagram}" target="_blank">📷 @${node.instagram}</a>`);
    if (linksHtml.length) html += `<div class="panel-links">${linksHtml.join("")}</div>`;

    // Projects
    if (PROJECTS) {
      const nodeProjects = PROJECTS.filter(p => p.people.includes(node.id));
      if (nodeProjects.length) {
        html += `<div style="margin-top:16px; font-size:12px; color:var(--text-dim); font-family:'JetBrains Mono',monospace;">`;
        html += `<div style="margin-bottom:6px; color:var(--text); font-weight:500;">Projects</div>`;
        nodeProjects.forEach(p => {
          const link = p.url ? `<a href="${p.url}" target="_blank" style="color:#4D96FF;">${p.title}</a>` : p.title;
          html += `<div style="padding:2px 0;">▸ ${link} <span style="opacity:0.5">(${p.type})</span></div>`;
        });
        html += `</div>`;
      }
    }

    // Connections
    const conns = CONNECTIONS.filter(c => c.source === node.id || c.target === node.id);
    if (conns.length) {
      html += `<div style="margin-top:16px; font-size:12px; color:var(--text-dim); font-family:'JetBrains Mono',monospace;">`;
      html += `<div style="margin-bottom:6px; color:var(--text); font-weight:500;">Connections</div>`;
      conns.forEach(c => {
        const otherId = c.source === node.id ? c.target : c.source;
        const other = nodeMap[otherId];
        if (other) {
          html += `<div style="padding:2px 0;">→ ${other.name} <span style="opacity:0.5">(${c.label})</span></div>`;
        }
      });
      html += `</div>`;
    }

    panelContent.innerHTML = html;
    scheduleDraw();
  }

  function formatNumber(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
  }

  // ─── Tag Filters ───────────────────────────────────
  function buildTagFilters() {
    const tagCounts = {};
    PEOPLE.forEach(p => p.tags.forEach(t => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }));

    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    const container = document.getElementById("tag-filters");

    // "All" button
    const allBtn = document.createElement("button");
    allBtn.className = "tag-btn active";
    allBtn.textContent = "all";
    allBtn.style.setProperty("--tag-color", "#fff");
    allBtn.addEventListener("click", () => {
      activeTag = null;
      updateTagButtons();
      simulation.alpha(0.3).restart();
      updateStats();
    });
    container.appendChild(allBtn);

    sorted.forEach(([tag, count]) => {
      const btn = document.createElement("button");
      btn.className = "tag-btn";
      btn.dataset.tag = tag;
      const color = CATEGORY_COLORS[tag] || "#888";
      btn.style.setProperty("--tag-color", color);
      btn.innerHTML = `${tag}<span class="count">${count}</span>`;
      btn.addEventListener("click", () => {
        activeTag = activeTag === tag ? null : tag;
        updateTagButtons();
        simulation.alpha(0.3).restart();
        updateStats();
      });
      container.appendChild(btn);
    });
  }

  function updateTagButtons() {
    document.querySelectorAll(".tag-btn").forEach(btn => {
      const tag = btn.dataset.tag;
      if (!tag) {
        btn.classList.toggle("active", !activeTag);
      } else {
        btn.classList.toggle("active", activeTag === tag);
      }
    });
  }

  function updateStats() {
    const visible = nodes.filter(isNodeVisible).length;
    document.getElementById("node-count").textContent = visible;
    document.getElementById("active-tags").textContent = activeTag || (searchQuery ? `"${searchQuery}"` : "all");
  }

  // ─── Search ────────────────────────────────────────
  const searchInput = document.getElementById("search");
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    simulation.alpha(0.2).restart();
    updateStats();
  });

  // ─── Grid Modes (P = alphabetical, F = followers) ──
  function computeGrid(sortFn) {
    var sorted = nodes.slice().sort(sortFn);
    var margin = 20;
    var targetRows = 10;
    var cols = Math.ceil(sorted.length / targetRows);
    var rows = Math.ceil(sorted.length / cols);
    var cellW = Math.max(60, (width - margin * 2) / cols);
    var cellH = Math.max(35, (height - margin * 2) / rows);
    var gridW = margin * 2 + cols * cellW;
    var gridH = margin * 2 + rows * cellH;
    var positions = {};
    sorted.forEach(function(node, i) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      positions[node.id] = {
        x: margin + col * cellW + cellW / 2,
        y: margin + row * cellH + cellH / 2
      };
    });
    positions._gridW = gridW;
    positions._gridH = gridH;
    return positions;
  }

  function activateGrid(mode) {
    if (gridMode === mode) {
      // Toggle off
      deactivateGrid();
      return;
    }
    gridMode = mode;

    var sortFn;
    if (mode === "alpha") {
      sortFn = function(a, b) { return a.name.toLowerCase().localeCompare(b.name.toLowerCase()); };
    } else if (mode === "followers") {
      sortFn = function(a, b) { return (b.followers || 0) - (a.followers || 0); };
    }

    var positions = computeGrid(sortFn);
      // Override forces to push toward grid
      simulation
        .force("charge", d3.forceManyBody().strength(-5))
        .force("center", null)
        .force("link", null)
        .force("x", d3.forceX(function(n) { return positions[n.id].x; }).strength(0.12))
        .force("y", d3.forceY(function(n) { return positions[n.id].y; }).strength(0.12))
        .force("collision", d3.forceCollide(function(n) {
          if (mode === "followers") {
            var f = n.followers || 0;
            return (f > 0 ? Math.max(4, 4 + Math.sqrt(f / maxFollowers) * 26) : 4) + 3;
          }
          var r = TIER_CONFIG[n.tier]?.radius || 7;
          return r + 4;
        }));
      // Zoom to fit the grid in the visible canvas
      var fitK = Math.min(width / positions._gridW, height / positions._gridH) * 0.92;
      transform = {
        x: (width - positions._gridW * fitK) / 2,
        y: (height - positions._gridH * fitK) / 2,
        k: fitK
      };
      simulation.alpha(1).alphaDecay(0.015).restart();
  }

  function deactivateGrid() {
      gridMode = null;
      // Restore organic forces
      simulation
        .force("charge", d3.forceManyBody().strength(function(n) {
          var r = TIER_CONFIG[n.tier]?.radius || 7;
          if (n.tier === "core") return -r * 30;
          if (n.tier === "go-to") return -r * 25;
          return -r * 20;
        }))
        .force("center", d3.forceCenter(width / 2, height / 2).strength(0.015))
        .force("link", d3.forceLink(links).id(function(d) { return d.id; }).distance(function(l) {
          if (l.strength === 3) return 120;
          if (l.strength === 2) return 180;
          return 250;
        }).strength(function(l) {
          return l.strength * 0.15;
        }))
        .force("x", d3.forceX(width / 2).strength(0.008))
        .force("y", d3.forceY(height / 2).strength(0.008))
        .force("collision", d3.forceCollide(function(n) {
          var r = TIER_CONFIG[n.tier]?.radius || 7;
          return r + 12;
        }));
      simulation.alpha(1).alphaDecay(0.006).restart();
      scheduleDraw();
  }

  // Keyboard shortcut
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
    if ((e.key === "p" || e.key === "P") && document.activeElement !== searchInput) {
      e.preventDefault();
      activateGrid("alpha");
    }
    if ((e.key === "f" || e.key === "F") && document.activeElement !== searchInput) {
      e.preventDefault();
      activateGrid("followers");
    }
    if (e.key === "Escape") {
      searchInput.blur();
      searchQuery = "";
      searchInput.value = "";
      activeTag = null;
      updateTagButtons();
      panel.classList.add("hidden");
      selectedNode = null;
      if (gridMode) deactivateGrid();
      else { simulation.alpha(0.2).restart(); }
      updateStats();
    }
  });

  // ─── Projects Panel ─────────────────────────────────
  const projectsPanel = document.getElementById("projects-panel");
  const projectsToggle = document.getElementById("projects-toggle");
  const projectsClose = document.getElementById("projects-close");
  const projectsList = document.getElementById("projects-list");

  function buildProjectsList() {
    projectsList.innerHTML = "";
    PROJECTS.forEach(function(project) {
      var card = document.createElement("div");
      card.className = "proj-card";
      card.dataset.projectId = project.id;

      // Thumbnail
      if (project.thumb) {
        var thumbWrap = document.createElement("div");
        thumbWrap.className = "proj-thumb";
        var thumbImg = document.createElement("img");
        thumbImg.src = project.thumb;
        thumbImg.alt = project.title;
        thumbImg.loading = "lazy";
        thumbWrap.appendChild(thumbImg);
        card.appendChild(thumbWrap);
      }

      var header = document.createElement("div");
      header.className = "proj-header";

      var left = document.createElement("div");
      var title = document.createElement("div");
      title.className = "proj-title";
      title.textContent = project.title;
      var meta = document.createElement("div");
      var typeSpan = document.createElement("span");
      typeSpan.className = "proj-type";
      typeSpan.textContent = project.type;
      var countSpan = document.createElement("span");
      countSpan.className = "proj-people-count";
      countSpan.textContent = project.people.length + " people";
      meta.appendChild(typeSpan);
      meta.appendChild(countSpan);
      left.appendChild(title);
      left.appendChild(meta);
      header.appendChild(left);

      var body = document.createElement("div");
      body.className = "proj-body";

      var desc = document.createElement("div");
      desc.className = "proj-desc";
      desc.textContent = project.description;
      body.appendChild(desc);

      if (project.url) {
        var link = document.createElement("a");
        link.className = "proj-watch";
        link.href = project.url;
        link.target = "_blank";
        link.textContent = "\u25B6 Watch / View \u2192";
        link.addEventListener("click", function(e) { e.stopPropagation(); });
        body.appendChild(link);
      }

      var peopleList = document.createElement("div");
      peopleList.className = "proj-people-list";
      project.people.forEach(function(pid) {
        var person = nodeMap[pid];
        if (!person) return;
        var chip = document.createElement("span");
        chip.className = "proj-person";
        // Add mini profile pic to person chip
        var hasPersonImg = nodeImages[pid];
        if (hasPersonImg) {
          var miniPic = document.createElement("img");
          miniPic.src = "img/" + pid + ".jpg";
          miniPic.className = "proj-person-pic";
          chip.appendChild(miniPic);
        }
        var nameSpan = document.createElement("span");
        nameSpan.textContent = person.name;
        chip.appendChild(nameSpan);
        chip.style.borderColor = person.primaryColor;
        chip.addEventListener("click", function(e) {
          e.stopPropagation();
          selectNode(person);
        });
        peopleList.appendChild(chip);
      });
      body.appendChild(peopleList);

      card.appendChild(header);
      card.appendChild(body);

      card.addEventListener("click", function() {
        var wasActive = activeProject === project;
        // Deactivate all
        document.querySelectorAll(".proj-card").forEach(function(c) { c.classList.remove("active"); });
        if (wasActive) {
          activeProject = null;
        } else {
          activeProject = project;
          card.classList.add("active");
        }
        simulation.alpha(0.1).restart();
        scheduleDraw();
      });

      projectsList.appendChild(card);
    });
  }

  projectsToggle.addEventListener("click", function() {
    var isOpen = !projectsPanel.classList.contains("hidden");
    if (isOpen) {
      projectsPanel.classList.add("hidden");
      activeProject = null;
      document.querySelectorAll(".proj-card").forEach(function(c) { c.classList.remove("active"); });
      projectsToggle.style.borderColor = "#2a2a3a";
      projectsToggle.style.color = "#8888a0";
    } else {
      // Close info panel if open
      panel.classList.add("hidden");
      selectedNode = null;
      projectsPanel.classList.remove("hidden");
      projectsToggle.style.borderColor = "#ff6b6b";
      projectsToggle.style.color = "#ff6b6b";
    }
    scheduleDraw();
  });

  projectsClose.addEventListener("click", function() {
    projectsPanel.classList.add("hidden");
    activeProject = null;
    document.querySelectorAll(".proj-card").forEach(function(c) { c.classList.remove("active"); });
    projectsToggle.style.borderColor = "#2a2a3a";
    projectsToggle.style.color = "#8888a0";
    scheduleDraw();
  });

  // ─── Init ──────────────────────────────────────────
  buildTagFilters();
  buildProjectsList();
  updateStats();

})();
