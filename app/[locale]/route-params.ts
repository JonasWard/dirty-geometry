export type LocaleParams = {
  /**
   * Optional because it is not present on the non-localized root routes.
   */
  locale?: string;
};

/** Next.js 15+ passes `params` as a Promise for layouts and pages. */
export type Props = {
  params: Promise<LocaleParams>;
};
