const GO_DURATION_PATTERN =
  /^[-+]?(?:(?:\d+(?:\.\d+)?|\.\d+)(?:ns|us|\u00b5s|ms|s|m|h))+$/;

export const GO_DURATION_HELP_TEXT =
  'Go duration format: e.g. 30s, 5m, 1h30m. Default: 5m.';

export function isValidGoDuration(value: string): boolean {
  return GO_DURATION_PATTERN.test(value);
}
