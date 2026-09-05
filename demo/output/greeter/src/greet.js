export function greet(name) {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new Error('name cannot be empty');
  }
  return `Hello, ${trimmed}!`;
}

export function shout(text) {
  return text.toUpperCase() + '!';
}