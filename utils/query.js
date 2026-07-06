DEFAULT_PAGE = 1;
DEFAULT_PAGE_LIMIT = 10;

const getPagination = (query) => {
  const page = Math.abs(query.page) || DEFAULT_PAGE;
  const limit = Math.abs(query.count) || DEFAULT_PAGE_LIMIT;
  const skip = (page - 1) * limit;
  return {
    skip,
    limit,
  };
};

const getDateRangeFilter = (query) => {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const parseDate = (value, fallback) => {
    if (!value) return fallback;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  };

  return {
    gte: parseDate(query.startdate, defaultStart),
    lte: parseDate(query.enddate, defaultEnd),
  };
};

module.exports = { getPagination, getDateRangeFilter };
