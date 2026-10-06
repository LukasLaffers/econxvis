// The site and its pages, in reading order. tools/build-site.cjs turns this into index.html (one tile per
// page) and the "previous / next" links at the bottom of every page.
// No lecture numbers (the user's wish): sections are titled by their handout and have no label.
module.exports = {
  site: {
    title: 'Econxvis',
    pageTitle: 'Econxvis — Visualizations for Econometrics',
    lead: 'Interactive figures for econometrics.',
    note: '<b>Work in progress.</b> The tools are still being developed and checked. Feedback of any kind is very welcome: errors, unclear explanations, ideas for new tools.',
    footer: 'Lukáš Lafférs'
  },
  // One section per handout. Each page: [folder, title, one-sentence description, advanced?]
  sections: [
    { id: 'regression', nav: 'Regression basics', title: 'Regression basics', pages: [
      ['ols-projection', 'Regression as a Projection', 'Least squares drops a perpendicular: ŷ is the shadow of y on the plane spanned by the columns of X.']
    ] }
  ]
};
