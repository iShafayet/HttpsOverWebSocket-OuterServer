export const sleep = (durationMillis: number) => {
  return new Promise((accept) => setTimeout(accept, durationMillis));
};
