module.exports = (req, res) => {
  res.json({
    got_test_header: !!req.headers["x-telegram-test-user"],
    header_value: req.headers["x-telegram-test-user"] || null,
    all: req.headers, // supaya keliatan lengkap
  });
};
