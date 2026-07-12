export function startVoiceService(config, bus, actions) {
  const voice = config.voice || {};
  if (!voice.enabled) return null;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Speech recognition not supported in this browser');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = voice.language || 'en-US';

  const wakeWord = (voice.wakeWord || 'mirror').toLowerCase();
  const commands = voice.commands || {};
  let listening = false;
  let wakeTimeout = null;

  function findCommand(transcript) {
    const text = transcript.toLowerCase().trim();
    const entries = Object.entries(commands);

    for (const [phrase, eventType] of entries) {
      if (text.includes(phrase.toLowerCase())) {
        return eventType;
      }
    }

    return null;
  }

  function handleResult(transcript) {
    console.log('Voice heard:', transcript);

    const text = transcript.toLowerCase();
    const hasWakeWord = text.includes(wakeWord);

    if (!hasWakeWord && voice.requireWakeWord !== false) {
      return;
    }

    const commandEvent = findCommand(transcript);
    if (commandEvent) {
      console.log('Voice command matched:', commandEvent);
      bus.dispatchEvent(new CustomEvent(commandEvent, { detail: { transcript, command: commandEvent } }));

      if (actions && typeof actions[commandEvent] === 'function') {
        actions[commandEvent]();
      }
    }
  }

  recognition.onresult = event => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        handleResult(event.results[i][0].transcript);
      }
    }
  };

  recognition.onerror = event => {
    if (event.error === 'not-allowed') {
      console.error('Voice recognition permission denied');
      return;
    }
    if (event.error === 'no-speech') {
      return;
    }
    console.error('Voice recognition error:', event.error);
  };

  recognition.onend = () => {
    if (listening) {
      try {
        recognition.start();
      } catch (err) {
        console.error('Voice restart failed:', err.message);
      }
    }
  };

  function start() {
    if (listening) return;
    listening = true;
    try {
      recognition.start();
      console.log('Voice recognition started');
    } catch (err) {
      console.error('Voice start failed:', err.message);
    }
  }

  function stop() {
    listening = false;
    if (wakeTimeout) clearTimeout(wakeTimeout);
    try {
      recognition.stop();
    } catch (err) {
      // ignore
    }
  }

  start();

  return { start, stop };
}
