const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const isProduction = process.env.NODE_ENV === 'production';
const refreshCookieDomain = String(process.env.REFRESH_COOKIE_DOMAIN || '').trim();

const getRefreshCookieOptions = () => {
  const options = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: ONE_MONTH_MS,
  };

  if (isProduction && refreshCookieDomain) {
    options.domain = refreshCookieDomain;
  }

  return options;
};

const getRefreshCookieClearOptions = () => {
  const options = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };

  if (isProduction && refreshCookieDomain) {
    options.domain = refreshCookieDomain;
  }

  return options;
};

module.exports = {
  getRefreshCookieOptions,
  getRefreshCookieClearOptions,
};
