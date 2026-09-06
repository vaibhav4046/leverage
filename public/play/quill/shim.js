/*
 * Quill in the browser.
 *
 * Quill's server is a Node process; this page has none. The shim answers the
 * same routes the server's tests define, keeps conversations, projects and
 * settings in this browser, and sends each message to an OpenAI-compatible
 * endpoint the visitor connects themselves. Nothing here holds a key of ours:
 * a key embedded in a public page would be an open relay.
 */
(function () {
  'use strict';

  const STORE_KEY = 'quill.play.v1';
  const ENDPOINT_KEY = 'quill.play.endpoint';
  const ALLOWED_ATTACHMENT = /\.(txt|md|json|csv|js|ts|py|html|css)$/i;

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode: state lives for the session only */
    }
  }

  const state = load(STORE_KEY, {
    conversations: [],
    projects: [],
    settings: { model: 'connected-model', temperature: 0.7, systemPrompt: 'You are Quill.' },
  });
  let endpoint = load(ENDPOINT_KEY, { baseUrl: '', apiKey: '', model: '' });

  const persist = () => save(STORE_KEY, state);
  const id = () => Math.random().toString(36).slice(2, 10);
  const now = () => new Date().toISOString();

  const json = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const text = (body, type, status = 200) => new Response(body, { status, headers: { 'content-type': type } });

  function findConversation(convId) {
    return state.conversations.find((c) => c.id === convId) || null;
  }

  function systemPrompt(conv) {
    const parts = [state.settings.systemPrompt || 'You are Quill.'];
    const project = conv.projectId ? state.projects.find((p) => p.id === conv.projectId) : null;
    if (project && project.instructions) parts.push(project.instructions);
    for (const a of conv.attachments || []) parts.push(`### ${a.name}\n${a.content}`);
    return parts.join('\n\n');
  }

  function modelMessages(conv) {
    return [{ role: 'system', content: systemPrompt(conv) }, ...conv.messages.map((m) => ({ role: m.role, content: m.content }))];
  }

  async function callModel(conv, onToken) {
    if (!endpoint.baseUrl || !endpoint.model) {
      throw new Error('Connect a model first: an OpenAI-compatible base URL, a key if it needs one, and a model id.');
    }
    const res = await fetch(`${endpoint.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: endpoint.model,
        temperature: state.settings.temperature,
        stream: Boolean(onToken),
        messages: modelMessages(conv),
      }),
    });
    if (!res.ok) throw new Error(`The model endpoint answered ${res.status}.`);
    if (!onToken) {
      const body = await res.json();
      return body.choices?.[0]?.message?.content || '';
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const token = JSON.parse(payload).choices?.[0]?.delta?.content || '';
          if (token) {
            full += token;
            onToken(token);
          }
        } catch {
          /* a partial frame; the next chunk completes it */
        }
      }
    }
    return full;
  }

  function streamReply(conv, userContent) {
    const encoder = new TextEncoder();
    return new ReadableStream({
      async start(controller) {
        const send = (s) => controller.enqueue(encoder.encode(s));
        try {
          const full = await callModel(conv, (token) => send(`data: ${JSON.stringify({ token })}\n\n`));
          conv.messages.push({ role: 'assistant', content: full, at: now() });
          conv.updatedAt = now();
          persist();
          send('event: done\ndata: {}\n\n');
        } catch (err) {
          send(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
        }
        controller.close();
      },
    });
  }

  async function handle(method, url, body) {
    const path = url.pathname;
    const q = url.searchParams.get('q');

    if (path === '/api/models') return json({ models: [endpoint.model || 'connected-model'], default: endpoint.model || 'connected-model' });

    if (path === '/api/settings') {
      if (method === 'GET') return json(state.settings);
      if (method === 'PUT') {
        const next = { ...state.settings, ...body };
        if (typeof next.temperature !== 'number' || next.temperature < 0 || next.temperature > 2) return json({ error: 'temperature must be between 0 and 2' }, 400);
        state.settings = next;
        persist();
        return json(state.settings);
      }
    }

    if (path === '/api/projects') {
      if (method === 'GET') return json(state.projects);
      if (method === 'POST') {
        if (!body || !body.name) return json({ error: 'name is required' }, 400);
        const project = { id: id(), name: body.name, instructions: body.instructions || '', createdAt: now() };
        state.projects.push(project);
        persist();
        return json(project, 201);
      }
    }

    if (path === '/api/conversations') {
      if (method === 'GET') {
        const list = state.conversations
          .filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()) || c.messages.some((m) => m.content.toLowerCase().includes(q.toLowerCase())))
          .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        return json(list.map(({ messages, ...rest }) => ({ ...rest, messageCount: messages.length })));
      }
      if (method === 'POST') {
        const conv = { id: id(), title: (body && body.title) || 'New chat', messages: [], attachments: [], projectId: null, createdAt: now(), updatedAt: now() };
        state.conversations.unshift(conv);
        persist();
        return json(conv, 201);
      }
    }

    const m = path.match(/^\/api\/conversations\/([^/]+)(?:\/([a-z]+))?$/);
    if (m) {
      const conv = findConversation(m[1]);
      const sub = m[2];
      if (!conv) return json({ error: 'conversation not found' }, 404);

      if (!sub) {
        if (method === 'GET') return json(conv);
        if (method === 'PATCH') {
          if (!body || typeof body.title !== 'string' || !body.title.trim()) return json({ error: 'title must not be empty' }, 400);
          conv.title = body.title.trim();
          conv.updatedAt = now();
          persist();
          return json(conv);
        }
        if (method === 'DELETE') {
          state.conversations = state.conversations.filter((c) => c.id !== conv.id);
          persist();
          return new Response(null, { status: 204 });
        }
      }

      if (sub === 'messages' && method === 'POST') {
        const content = body && typeof body.content === 'string' ? body.content.trim() : '';
        if (!content) return json({ error: 'content must not be empty' }, 400);
        conv.messages.push({ role: 'user', content, at: now() });
        if (conv.title === 'New chat') conv.title = content.slice(0, 40);
        conv.updatedAt = now();
        persist();
        if (body.stream) return new Response(streamReply(conv, content), { headers: { 'content-type': 'text/event-stream' } });
        try {
          const reply = await callModel(conv);
          const message = { role: 'assistant', content: reply, at: now() };
          conv.messages.push(message);
          conv.updatedAt = now();
          persist();
          return json({ reply: message, conversation: conv });
        } catch (err) {
          return json({ error: err.message }, 503);
        }
      }

      if (sub === 'regenerate' && method === 'POST') {
        if (conv.messages.at(-1)?.role === 'assistant') conv.messages.pop();
        try {
          const reply = await callModel(conv);
          const message = { role: 'assistant', content: reply, at: now() };
          conv.messages.push(message);
          conv.updatedAt = now();
          persist();
          return json({ reply: message, conversation: conv });
        } catch (err) {
          return json({ error: err.message }, 503);
        }
      }

      if (sub === 'export' && method === 'GET') {
        const md = [`# ${conv.title}`, '', ...conv.messages.map((x) => `**${x.role === 'user' ? 'User' : 'Quill'}:** ${x.content}`)].join('\n');
        return text(md, 'text/markdown');
      }

      if (sub === 'project' && method === 'POST') {
        const project = state.projects.find((p) => p.id === (body && body.projectId));
        if (!project) return json({ error: 'project not found' }, 404);
        conv.projectId = project.id;
        persist();
        return json(conv);
      }

      if (sub === 'attachments' && method === 'POST') {
        if (!body || !body.name || !ALLOWED_ATTACHMENT.test(body.name)) return json({ error: 'only text attachments are accepted' }, 400);
        const attachment = { id: id(), name: body.name, content: String(body.content || ''), at: now() };
        conv.attachments = conv.attachments || [];
        conv.attachments.push(attachment);
        persist();
        return json(attachment, 201);
      }
    }

    return json({ error: 'not found' }, 404);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
    const method = ((init && init.method) || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    let body = null;
    if (init && init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = null;
      }
    }
    try {
      return await handle(method, url, body);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  };

  // The connect bar: where the visitor's endpoint lives. Sits above the app.
  function mountConnectBar() {
    const bar = document.createElement('form');
    bar.id = 'quill-connect';
    bar.setAttribute('aria-label', 'Connect a model');
    bar.style.cssText =
      'position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 12px;background:#0f1013;border-bottom:1px solid #26282e;font:13px Inter,system-ui,sans-serif;color:#c9cbd3;';
    bar.innerHTML =
      '<span style="opacity:.75">Connect a model (stays in this browser):</span>' +
      '<input name="baseUrl" placeholder="OpenAI-compatible base URL, e.g. https://openrouter.ai/api/v1" style="flex:2;min-width:220px;padding:6px 8px;border:1px solid #33363d;border-radius:6px;background:#15171b;color:#eee">' +
      '<input name="apiKey" type="password" placeholder="API key (if the endpoint needs one)" autocomplete="off" style="flex:1;min-width:160px;padding:6px 8px;border:1px solid #33363d;border-radius:6px;background:#15171b;color:#eee">' +
      '<input name="model" placeholder="model id" style="flex:1;min-width:120px;padding:6px 8px;border:1px solid #33363d;border-radius:6px;background:#15171b;color:#eee">' +
      '<button type="submit" style="padding:6px 12px;border:1px solid #6d5dfc;border-radius:6px;background:#6d5dfc;color:#fff;cursor:pointer">Connect</button>' +
      '<span id="quill-connect-state" style="opacity:.75"></span>';
    const setState = () => {
      bar.querySelector('#quill-connect-state').textContent = endpoint.model ? `connected: ${endpoint.model}` : 'not connected';
    };
    bar.elements.baseUrl.value = endpoint.baseUrl || '';
    bar.elements.model.value = endpoint.model || '';
    bar.addEventListener('submit', (e) => {
      e.preventDefault();
      endpoint = {
        baseUrl: bar.elements.baseUrl.value.trim(),
        apiKey: bar.elements.apiKey.value.trim(),
        model: bar.elements.model.value.trim(),
      };
      save(ENDPOINT_KEY, endpoint);
      state.settings.model = endpoint.model || state.settings.model;
      persist();
      setState();
    });
    setState();
    document.body.prepend(bar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountConnectBar);
  else mountConnectBar();
})();
