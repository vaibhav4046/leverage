export function countWords(text) {
  if (!text || !text.trim()) {
    return 0;
  }
  
  const words = text.split(/\s+/).filter(word => word.length > 0);
  return words.length;
}

export function topWords(text, n) {
  if (!text || !text.trim()) {
    return [];
  }
  
  const words = text.split(/\s+/).filter(word => word.length > 0);
  const lowerCasedWords = words.map(word => word.toLowerCase());
  
  const frequency = {};
  for (const word of lowerCasedWords) {
    frequency[word] = (frequency[word] || 0) + 1;
  }
  
  const entries = Object.entries(frequency);
  
  entries.sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    return a[0].localeCompare(b[0]);
  });
  
  return entries.slice(0, n);
}