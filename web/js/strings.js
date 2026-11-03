// strings.js — the text catalogue (i18n.js reads it): English, the default, and Brazilian Portuguese. Keys are
// prefixed by area: mascot. (the page, the face, the seven moods and the voice captions) and api. (the client's own
// error messages). {name} is replaced by vars.name.

export const en = {
  'mascot.title': 'Cody',
  'mascot.face': 'The Cody mascot, {mood}',
  'mascot.gallery': 'THE SEVEN MOODS',
  'mascot.galleryHint': 'Move the pointer: they all look at it. Click: they hop.',
  'mascot.mood.listening': 'listening', 'mascot.mood.talking': 'talking', 'mascot.mood.pointing': 'pointing',
  'mascot.mood.thinking': 'thinking', 'mascot.mood.happy': 'happy', 'mascot.mood.resting': 'resting',
  'mascot.mood.sleepy': 'sleepy',
  'mascot.voice.listening': 'listening…', 'mascot.voice.you': 'you: {text}', 'mascot.voice.thinking': 'thinking…',
  'mascot.voice.didntCatch': "didn't catch that", 'mascot.voice.noChannel': 'start the voice session on your computer',
  'mascot.voice.noRecognition': 'this browser has no speech recognition', 'mascot.voice.noReply': 'no reply yet',
  'mascot.voice.wakeWord': 'listening for “Cody”', 'mascot.voice.wakeWordOff': '“Cody” off',
  'api.timeout': "the server didn't answer in time", 'api.offline': 'no connection to the server',
  'mascot.shot.alt': 'Screenshot of your computer', 'mascot.shot.share': 'Share', 'mascot.shot.save': 'Save',
  'mascot.shot.close': 'Close', 'mascot.shot.failed': 'the screenshot did not arrive',
  'api.error': 'error {status}',
};

export const pt = {
  'mascot.title': 'Cody',
  'mascot.face': 'O mascote Cody, {mood}',
  'mascot.gallery': 'OS SETE HUMORES',
  'mascot.galleryHint': 'Mexa o ponteiro: todos olham para ele. Clique: eles pulam.',
  'mascot.mood.listening': 'ouvindo', 'mascot.mood.talking': 'falando', 'mascot.mood.pointing': 'apontando',
  'mascot.mood.thinking': 'pensando', 'mascot.mood.happy': 'feliz', 'mascot.mood.resting': 'descansando',
  'mascot.mood.sleepy': 'sonolento',
  'mascot.voice.listening': 'ouvindo…', 'mascot.voice.you': 'você: {text}', 'mascot.voice.thinking': 'pensando…',
  'mascot.voice.didntCatch': 'não entendi', 'mascot.voice.noChannel': 'abra a sessão de voz no computador',
  'mascot.voice.noRecognition': 'este navegador não tem reconhecimento de voz', 'mascot.voice.noReply': 'ainda sem resposta',
  'mascot.voice.wakeWord': 'ouvindo “Cody”', 'mascot.voice.wakeWordOff': '“Cody” desligado',
  'api.timeout': 'o servidor não respondeu a tempo', 'api.offline': 'sem conexão com o servidor',
  'mascot.shot.alt': 'Print da tela do computador', 'mascot.shot.share': 'Compartilhar', 'mascot.shot.save': 'Salvar',
  'mascot.shot.close': 'Fechar', 'mascot.shot.failed': 'o print não chegou',
  'api.error': 'erro {status}',
};
