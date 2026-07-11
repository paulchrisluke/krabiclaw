-- NCLS Blawby local seed
-- Generated from /Users/paulchrisluke/Repos2026/krabiclaw/client-imports/north-carolina-legal-services/client-manifest.json
-- Preview at: http://ncls.localhost:3000

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO themes (id, name, slug, version, description, status)
VALUES ('blawby-theme-v1', 'Blawby', 'blawby', '1.0.0', 'Professional-service public template', 'active');

DELETE FROM sites WHERE id = 'site-ncls-blawby' OR subdomain = 'ncls';
DELETE FROM organization WHERE id = 'org-ncls-blawby';
DELETE FROM site_domains WHERE domain IN ('ncls.localhost', 'ncls.krabiclaw.com', 'northcarolinalegalservices.org');
DELETE FROM user WHERE id = 'user-ncls-blawby';

INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES ('user-ncls-blawby', 'NCLS Blawby Owner', 'ncls-blawby@example.test', 1, 'admin', unixepoch(), unixepoch());

INSERT INTO organization (id, name, slug, createdAt)
VALUES ('org-ncls-blawby', 'North Carolina Legal Services', 'north-carolina-legal-services', unixepoch());

INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES ('member-ncls-blawby', 'org-ncls-blawby', 'user-ncls-blawby', 'owner', unixepoch());

INSERT INTO sites (
  id, organization_id, theme_id, theme, slug, subdomain, public_url,
  brand_name, brand_description, contact_email, contact_phone,
  source_locale, default_currency, status, plan, onboarding_status,
  url_structure, vertical, content_source, media_source, created_at, updated_at
) VALUES (
  'site-ncls-blawby', 'org-ncls-blawby', 'blawby-theme-v1', 'blawby',
  'ncls', 'ncls', 'http://ncls.localhost:3000',
  'North Carolina Legal Services', 'Access to Justice for All. North Carolina''s affordable legal services. We believe that access to the Justice System is a fundamental right. At North Carolina Legal Services we are committed to removing financial barriers that prevent many in our community from obtaining high-quality legal assistance.',
  'contact@northcarolinalegalservices.org', '(919) 886-4134',
  'en', 'USD', 'active', 'managed', 'active',
  'brand_pages', 'service', 'client_supplied', 'client_photos', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO site_domains (id, organization_id, site_id, domain, type, role, status, dns_status, activated_at, created_at, updated_at)
VALUES
  ('domain-ncls-localhost', 'org-ncls-blawby', 'site-ncls-blawby', 'ncls.localhost', 'subdomain', 'canonical', 'active', 'valid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('domain-ncls-prod-subdomain', 'org-ncls-blawby', 'site-ncls-blawby', 'ncls.krabiclaw.com', 'subdomain', 'secondary', 'active', 'valid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO business_locations (
  id, organization_id, site_id, slug, title, city, address, phone, email,
  website_url, maps_url, categories, is_primary, status, description, timezone,
  created_at, updated_at
) VALUES (
  'loc-ncls-blawby-main', 'org-ncls-blawby', 'site-ncls-blawby', 'main',
  'North Carolina Legal Services', 'North Carolina',
  NULL, '(919) 886-4134', 'contact@northcarolinalegalservices.org', 'https://northcarolinalegalservices.org', NULL,
  '["LegalService","ProfessionalService"]', 1, 'active',
  'Access to Justice for All. North Carolina''s affordable legal services. We believe that access to the Justice System is a fundamental right. At North Carolina Legal Services we are committed to removing financial barriers that prevent many in our community from obtaining high-quality legal assistance.', 'America/New_York', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

UPDATE sites SET primary_location_id = 'loc-ncls-blawby-main' WHERE id = 'site-ncls-blawby';

INSERT INTO site_locales (id, organization_id, site_id, locale, label, is_source, status, fallback_enabled)
VALUES ('locale-ncls-en', 'org-ncls-blawby', 'site-ncls-blawby', 'en', 'English', 1, 'published', 1);

INSERT INTO offerings (
  id, organization_id, site_id, location_id, name, slug, label, summary,
  short_description, body, features, faqs, cta_label, cta_url,
  thumbnail_asset_id, hero_image_asset_id, media_asset_ids, schema_type,
  seo_title, seo_description, canonical_path, status, sort_order, featured,
  source, source_ref, created_at, updated_at
) VALUES
(
  'offering_ncls_family', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'Family law', 'family', 'Offer',
  'Empower your family to move forward confidently', 'At NCLS, we offer empathetic and result-oriented representation for our clients'' family law concerns. We strive to help our clients move on with their lives feeling confident.', 'At NCLS, we offer empathetic and result-oriented representation for our clients'' family law concerns. Our mission is to guide clients through some of the most challenging times in their lives with compassion and expertise. We understand that family law matters are deeply personal and require a tailored approach to meet the unique needs of each individual. Our team is dedicated to providing comprehensive legal support, ensuring that you receive the guidance and representation necessary to move forward confidently. Whether you are facing a divorce, child custody dispute, or need assistance with alimony, our goal is to help you achieve the best possible outcome while minimizing stress and conflict.

      We offer a wide range of family law services, including assistance with child support, custodial power of attorney, and third-party custody claims. Our experienced attorneys are skilled in drafting prenuptial and separation agreements, navigating equitable distribution of assets, and enforcing court orders related to family law matters. We also provide support for those seeking domestic violence protective orders and offer mediation services to resolve disputes amicably. At NCLS, we are committed to protecting your rights and interests, ensuring that you receive fair treatment and justice in all family law matters. Let us be your trusted advocate as you navigate these important and often complex legal challenges.',
  '["Alimony: NCLS can help you with spousal support claims in North Carolina, both temporary and permanent. We also assist with temporary alimony claims during divorce proceedings.","Child Custody and Visitation: We provide assistance with filing for custody, creating custody and visitation plans, modifying custody orders, or filing a third-party custody claim. Our goal is to help our clients resolve custody issues in a way that benefits their children and reduces conflicts.","Child Support: We help parents or guardians who need legal aid to establish accurate child support orders and ensure they are enforced or modified as needed.","Custodial Power of Attorney: We assist parents in planning for unexpected situations and making arrangements for the care of their children if they become unavailable.","Divorce: We provide legal representation for those considering divorce, those who have filed for divorce and need further assistance, and those who have been served with divorce papers from their spouse.","Third-Party Custody: We represent grandparents, relatives, and other third parties seeking custody of a child when it is in the child''s best interest.","Prenuptial Agreements: We help couples planning to marry put a clear, enforceable agreement in place covering property, debt, and support expectations before the wedding, so both spouses start the marriage with shared understanding and legal protection.","Separation Agreements: We assist clients in drafting and negotiating separation agreements that outline the terms of their separation, including property division, alimony, and child custody arrangements.","Equitable Distribution: We help clients navigate the division of marital property, ensuring a fair and equitable distribution of assets and debts during divorce proceedings.","Domestic Violence Protective Orders (DVPO): Some of our partner organizations, like Legal Aid North Carolina, can provide assistance with obtaining a DVPO at no cost to you. However, if they are unable to take your case, we can help you obtain protection from domestic violence. We may also be able to connect you with other services in your area for holistic support.","Visitation: We work with parents to create visitation schedules that promote the best interests of their children and ensure meaningful time with both parents.","Child Support Modifications: We help clients modify existing child support orders due to changes in circumstances such as income, employment, or the needs of the child.","Custody Evaluations: We provide support and representation during custody evaluations to ensure that the best interests of the children are considered in custody decisions.","Enforcement of Court Orders: We assist clients in enforcing court orders related to child support, alimony, custody, and visitation to ensure compliance and address any violations.","Mediation Services: We offer mediation services to help clients resolve family law disputes amicably and efficiently, often leading to mutually agreeable solutions without the need for litigation."]', '[{"question":"How do I file for divorce in North Carolina?","answer":"To file for divorce in North Carolina, you usually need to show that you and your spouse lived separate and apart for one year with the intent to end the marriage. The complaint is filed in the county where either spouse lives, and related claims like custody or property division can be filed at the same time. If property division or support claims are not filed before the divorce is granted, you could lose the right to bring them later. An attorney can help you protect your rights and file correctly."},{"question":"Do I have to be separated for one year before I can get divorced in NC?","answer":"Couples in North Carolina are generally expected to live separate and apart for one continuous year before a divorce will be granted. Courts usually expect different residences, but where maintaining two households isn''t possible, judges may look at factors like ending marital relations or separating finances. Because judges weigh these facts case by case, it helps to get advice about your situation."},{"question":"What''s the difference between legal separation and divorce in North Carolina?","answer":"A legal separation means spouses live apart with the intent to end the marriage but remain legally married. Divorce permanently ends the marriage and allows remarriage, and both processes can involve court orders about custody, support, or property. An attorney can explain which option best fits your circumstances."},{"question":"How is child custody decided in NC?","answer":"Custody decisions are based on the child''s best interests, with judges looking at caregiving history, living arrangements, and stability in each home. Parents can agree on a schedule or ask the court to decide. Legal advice can clarify what factors are most important in your case."},{"question":"How is child support calculated in North Carolina?","answer":"Child support is usually set under state guidelines that consider both parents'' incomes, custody schedules, and expenses such as childcare or health insurance. Courts may deviate if special circumstances make the guideline amount unfair. An attorney can help you estimate likely support amounts for your situation."},{"question":"How is alimony determined in North Carolina?","answer":"Alimony, or spousal support, depends on one spouse''s financial need and the other''s ability to pay. Judges weigh factors like the length of the marriage, income differences, health, and contributions to the household. Legal guidance can help you understand how these factors may apply."},{"question":"What does \"no-fault divorce\" mean in NC?","answer":"North Carolina allows no-fault divorce, which means neither spouse has to prove misconduct to end the marriage. The main requirement is one year of separation with the intent to end the marriage. If you''re unsure whether your situation qualifies, an attorney can explain how the rule applies to your case."},{"question":"Can I represent myself in family court?","answer":"You are allowed to represent yourself, but family law cases involve complex rules and high-stakes issues. Many people choose a lawyer for help with forms, hearings, or negotiations, and limited-scope representation is also an option. Talking with an attorney can help you decide what level of support you need."},{"question":"How much does a divorce usually cost in North Carolina?","answer":"The cost of divorce varies depending on whether it is contested and what issues must be resolved. Court filing fees apply, and at NCLS we use sliding-scale fees and payment plans to make representation affordable. We can provide a clearer estimate after reviewing your situation."},{"question":"Can I change or modify a child support order in NC?","answer":"In North Carolina, child support orders may be modified if there has been a substantial change in circumstances, such as changes in income, childcare costs, or the child''s needs. Any change must be approved by the court through a formal motion. An attorney can help you determine whether your situation qualifies for a modification."}]',
  'Schedule a consultation', '/schedule',
  NULL, NULL, '[]', 'LegalService',
  'Family law | North Carolina Legal Services', 'At NCLS, we offer empathetic and result-oriented representation for our clients'' family law concerns. We strive to help our clients move on with their lives feeling confident.', '/services/family',
  'published', 1, 1,
  'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'offering_ncls_small-business-and-nonprofits', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'Small Business and Nonprofits', 'small-business-and-nonprofits', 'Offer',
  'Legal support for small businesses and nonprofits to succeed', 'We believe that small businesses and nonprofits give our community its distinct and special character. We are committed to helping entrepreneurs, small business owners, and nonprofit leaders with the legal support they need to succeed in a competitive and challenging environment.', 'We believe that small businesses and nonprofits give our community its distinct and special character. At NCLS, we are dedicated to providing entrepreneurs, small business owners, and nonprofit leaders with the legal support they need to thrive in a competitive and challenging environment. Our team understands the unique challenges you face and is committed to offering personalized guidance and comprehensive legal services tailored to your specific needs.

        Whether you need assistance with arbitration and mediation to avoid costly trials, business entity formation to ensure the right structure and compliance, or navigating the complexities of employment law, NCLS is here to help. Our expertise also extends to commercial litigation, nonprofit formation and governance, contract negotiations, and risk management. Our goal is to resolve disputes efficiently and effectively, allowing you to focus on growing your business or nonprofit. Let us be your trusted legal partner, dedicated to your success and the vitality of our community.',
  '["Arbitration/Mediation: Avoid lengthy and expensive trials with our arbitration and mediation services. NCLS represents businesses in arbitration/mediation proceedings, enforces arbitration agreements, and appoints arbitrators and mediators to resolve disputes.","Business Entity Formation: We guide local businesses through selecting the right business structure, drafting and filing formation documents, registering for tax and regulatory requirements, and preparing governance documents such as bylaws or operating agreements.","Compliance: Stay compliant with state and federal laws and regulations with our assistance. We handle annual reports, maintain corporate records, and provide guidance on regulatory changes to ensure ongoing compliance.","Commercial Litigation: We represent businesses in commercial litigation matters, including breach of contract, partnership disputes, and other business-related conflicts. Our goal is to resolve disputes efficiently and effectively.","Contracts: We offer comprehensive services for business contracts, including drafting, reviewing, and negotiating. Our guidance covers essential terms and provisions like payment and delivery terms, warranties, liability limitations, and dispute resolution mechanisms.","Employment Law: Get expert guidance on employment law matters, including drafting employee handbooks, advising on hiring and termination practices, and ensuring compliance with employment regulations. We also represent businesses in employment disputes and litigation.","Nonprofit Formation and Governance: We support nonprofits with formation, including drafting and filing articles of incorporation, obtaining tax-exempt status, and creating bylaws. We also offer ongoing governance support to ensure compliance with nonprofit regulations.","Partnership Agreements: We advise on the terms of partnership agreements, covering ownership, management structure, profit and loss sharing, decision-making processes, dispute resolution mechanisms, and dissolution provisions. We assist in drafting, reviewing, and negotiating these agreements.","Real Estate Transactions: Ensure smooth real estate transactions with our assistance. We draft and review lease agreements, purchase contracts, and sale agreements, ensuring compliance with all legal requirements.","Risk Management: Identify and mitigate potential legal risks with our help. We review business practices, draft risk management policies, and provide compliance training and best practices.","Shareholder Agreements: We draft and review shareholder agreements, outlining the rights and responsibilities of shareholders, including provisions for the transfer of shares, voting rights, and dispute resolution mechanisms.","Taxation: Navigate complex tax laws and regulations with our tax planning and compliance services. We handle tax return preparation, tax dispute resolution, and strategic tax planning to optimize your business''s tax position."]', '[{"question":"Do I need a lawyer to start a small business in NC?","answer":"You can start a business by filing with the NC Secretary of State and meeting tax and licensing requirements, but many owners miss important steps such as drafting an operating agreement or protecting their brand. A lawyer can help you set up correctly and avoid problems later."},{"question":"What''s the difference between an LLC and a corporation in North Carolina?","answer":"Both structures limit liability, but LLCs are generally simpler to manage while corporations follow more formal rules. The right choice depends on ownership, growth plans, and tax treatment. An attorney can explain which option best fits your goals."},{"question":"What legal documents do nonprofits need to operate in NC?","answer":"Most nonprofits need Articles of Incorporation, Bylaws, and IRS tax-exempt recognition. Policies such as a conflict-of-interest policy and proper board governance documents are also strongly recommended. A lawyer can make sure your nonprofit meets state and federal requirements from the start."},{"question":"How do I protect my business name and brand legally?","answer":"In North Carolina, registering your business name does not protect it as a trademark. Trademark registration at the state or federal level is usually needed to prevent others from using it. Legal advice can help you choose the right protection for your brand."},{"question":"What contracts should every small business in NC have?","answer":"Businesses commonly need contracts for clients, vendors, and employees that clearly set out rights and obligations. Poorly drafted agreements can lead to disputes or unexpected liability. A lawyer can draft or review contracts to safeguard your business."},{"question":"How do I register a nonprofit in North Carolina?","answer":"Nonprofits must file Articles of Incorporation with the NC Secretary of State and apply for IRS recognition of tax-exempt status. Additional registrations may be required if you plan to solicit donations. An attorney can guide you through each step so you don''t miss deadlines."},{"question":"What are common legal risks for small business owners?","answer":"Risks include misclassifying workers, failing to follow employment laws, and operating without written agreements. Tax problems and partnership disputes are also frequent issues. A lawyer can help you identify risks early and reduce your exposure."},{"question":"Can business disputes be resolved without going to court in NC?","answer":"Many disputes can be resolved through negotiation, mediation, or arbitration. These options are usually faster and less costly than litigation, but they still require strong agreements. Legal help can make sure your interests are protected in the process."},{"question":"Can a lawyer help me negotiate a commercial lease in NC?","answer":"Yes. Commercial leases are often the most important financial decision a new business owner can make, and a bad lease can create a lot of problems down the road. A lawyer can review or negotiate terms so you understand your obligations before signing."},{"question":"How much does legal help for a nonprofit or small business cost?","answer":"At NCLS, qualifying small businesses (as defined by the SBA) and nonprofits receive a 50% discount off the market rate for legal services and representation. Businesses that do not qualify as small businesses pay the standard market rate. With affordable help available, you can address small issues before they grow into expensive problems. Even if you''re not sure you need an attorney now, a quick consultation can uncover blind spots and help you plan for your organization''s future."}]',
  'Schedule a consultation', '/schedule',
  NULL, NULL, '[]', 'LegalService',
  'Small Business and Nonprofits | North Carolina Legal Services', 'We believe that small businesses and nonprofits give our community its distinct and special character. We are committed to helping entrepreneurs, small business owners, and nonprofit leaders with the legal support they need to succeed in a competitive and challenging environment.', '/services/small-business-and-nonprofits',
  'published', 2, 1,
  'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'offering_ncls_employment', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'Employment Law', 'employment', 'Offer',
  'Protect your rights in the workplace', 'At NCLS, we are dedicated to protecting the rights of employees and ensuring fair treatment in the workplace. If you''ve been wronged by your employer, we''re here to help you get the justice and compensation you deserve.', 'At NCLS, we are dedicated to protecting the rights of employees and ensuring fair treatment in the workplace. If you''ve been wronged by your employer, we''re here to help you get the justice and compensation you deserve. Our experienced team is committed to fighting for your rights and providing comprehensive legal support tailored to your unique situation. 

      Whether you are dealing with a breach of an employment contract, civil rights violations, or contract disputes, NCLS is prepared to stand by your side. We handle cases involving age, gender, and sexual orientation discrimination, as well as issues related to marital status, national origin, pregnancy, and religious beliefs. Whether your case relates to defamation, employee benefits, FMLA violations, harassment claims, military leave rights under USERRA, privacy rights, retaliation and whistleblower claims, union rights, wage and hour disputes, workers'' compensation claims, workplace safety, and wrongful termination. Our goal is to ensure you receive fair treatment and the justice you deserve.',
  '["Breach of Employment Contract: If your employer has breached the terms of your employment contract, we can help you seek enforcement or compensation for the damages caused.","Civil Rights Violations: We protect your civil rights in the workplace, including: Age Discrimination (Adverse actions based on age, particularly for employees 40 years or older.) Gender Discrimination (Unequal pay, denial of promotions, or other adverse actions based on gender.) Gender Identity Discrimination (Issues related to gender identity or expression, including bathroom access, dress codes, and more.) Marital Status Discrimination (Unfair treatment based on marital status.) National Origin Discrimination (Biased treatment or harassment based on ethnicity or accent.) Pregnancy Discrimination (Unfair treatment or denial of accommodations due to pregnancy, childbirth, or related conditions.) Religious Discrimination (Failure to accommodate religious beliefs or practices, or harassment based on religion.) Sexual Orientation Discrimination (Unfair treatment or harassment based on sexual orientation, including protections for LGBTQ+ employees.)","Contract & Agreement Disputes: Employment agreements can be complex. We handle disputes involving non-compete clauses, severance agreements, employment contracts, and other contractual issues, ensuring your interests are safeguarded.","Defamation and Damage to Reputation: If your reputation has been unfairly damaged by your employer or colleagues, we can help you seek redress and protect your good name.","Employee Benefits & Rights: From health insurance disputes to issues with vacation pay, we are committed to protecting your rights and ensuring you receive the benefits you are entitled to under the law.","Family and Medical Leave Act (FMLA) Violations: If your employer has denied you the leave you are entitled to under the FMLA, we can help. We handle cases involving wrongful denial of leave and retaliation for taking leave.","Harassment Claims: Everyone deserves a safe and respectful work environment. Whether you are experiencing bullying, sexual harassment, or any other form of workplace harassment, we take your claims seriously and work diligently to provide protection and justice.","Military Leave and USERRA Rights: As a service member, you are entitled to protections under the Uniformed Services Employment and Reemployment Rights Act (USERRA). We assist with issues related to military leave, reemployment rights, and protection against discrimination.","Privacy Rights in the Workplace: We protect employees'' privacy rights, including issues related to monitoring, searches, and the use of personal information by employers.","Retaliation & Whistleblower Claims: Standing up against wrongdoing should be encouraged, not punished. We defend those who have faced retaliation for acting ethically and legally, ensuring their rights are protected.","Union Rights and Collective Bargaining: We represent employees in matters related to union rights, collective bargaining agreements, and disputes with employers over union-related issues.","Wage & Hour Disputes: Ensuring you receive the compensation you deserve is our priority. We handle cases involving unpaid overtime, wage theft, misclassification of employees, and other wage-related issues to ensure fair treatment and compensation.","Workers Compensation Claims: If you have been injured on the job, we can assist you in filing for workers compensation benefits and appealing denied claims, ensuring you receive the support and compensation you deserve.","Workplace Safety and OSHA Violations: Your safety at work is paramount. We represent employees who have been exposed to unsafe working conditions or have faced retaliation for reporting Occupational Safety and Health Administration (OSHA) violations.","Wrongful Termination: If you have been terminated under questionable circumstances, we are here to help. We thoroughly evaluate every aspect of your termination to determine if your rights have been violated and to seek justice on your behalf."]', '[{"question":"What counts as wrongful termination in North Carolina?","answer":"In North Carolina most workers can be fired at any time. However, a firing may be wrongful if it violates anti-discrimination laws, retaliates against protected activity, or breaches a contract. An attorney can help you evaluate whether your termination qualifies."},{"question":"Can I be fired without notice in NC?","answer":"In most cases, North Carolina law does not require employers to give notice before firing an employee. Exceptions exist if you have an employment contract that requires notice, or if the termination violates another law such as anti-discrimination or anti-retaliation protections. An attorney can review your circumstances and explain whether those protections apply."},{"question":"What protections do I have against discrimination at work in NC?","answer":"Employees are protected by federal and state laws against discrimination based on race, sex, age, disability, religion, and other categories. These laws also prohibit retaliation for reporting discrimination. If you''ve experienced workplace discrimination, legal advice can help you decide on next steps."},{"question":"How do I file a workplace discrimination complaint in NC?","answer":"Complaints can be filed with the Equal Employment Opportunity Commission (EEOC) or the NC Human Relations Commission. Deadlines are short—often 180 days—so it''s important to act quickly. An attorney can help you prepare and file a strong complaint."},{"question":"What is considered a hostile work environment in North Carolina?","answer":"A hostile environment occurs when harassment or discrimination is severe or pervasive enough to interfere with an employee''s work. This can include repeated offensive comments, threats, or intimidation. Legal guidance can help you determine whether your situation meets the legal standard."},{"question":"How do I request a workplace accommodation under the ADA in NC?","answer":"You can request an accommodation by notifying your employer of your disability and the changes you need to perform your job. Employers must engage in an interactive process to find a reasonable solution. A lawyer can advise you if your request is denied or ignored."},{"question":"What deadlines apply for filing an EEOC charge in NC?","answer":"Most discrimination claims must be filed within 180 days of the incident, though some extend to 300 days if state law also applies. Missing the deadline can bar your claim entirely. An attorney can ensure your filing is timely and complete."},{"question":"What wage and hour laws apply to NC employees?","answer":"North Carolina follows the federal Fair Labor Standards Act (FLSA), which sets rules for minimum wage, overtime, and recordkeeping. Misclassification of employees as exempt or as contractors is a common issue. Legal advice can clarify whether you are being paid correctly."},{"question":"Can my employer retaliate if I report harassment or discrimination?","answer":"Retaliation is illegal under both state and federal law. If your hours are cut, you''re reassigned unfairly, or you''re fired after reporting misconduct, you may have a claim. A lawyer can help you prove retaliation and protect your rights."},{"question":"How can a lawyer help me review a severance agreement in NC?","answer":"An attorney can explain what rights you are giving up, whether the payment is fair, and if the agreement complies with the law. They can also negotiate for better terms if appropriate. Getting a review before signing can prevent you from losing important rights."}]',
  'Schedule a consultation', '/schedule',
  NULL, NULL, '[]', 'LegalService',
  'Employment Law | North Carolina Legal Services', 'At NCLS, we are dedicated to protecting the rights of employees and ensuring fair treatment in the workplace. If you''ve been wronged by your employer, we''re here to help you get the justice and compensation you deserve.', '/services/employment',
  'published', 3, 1,
  'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'offering_ncls_tenant-rights', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'Tenant Rights Law', 'tenant-rights', 'Offer',
  'Expert assistance to protect your home', 'Navigating legal issues with your landlord can be complicated and stressful. We provide expert legal assistance to ensure that your rights are protected when resolving disputes with your landlord.', 'Facing tenant-landlord disputes can be overwhelming. At NCLS, we are committed to protecting the rights of tenants and ensuring they are treated fairly by landlords. Our experienced legal team offers a wide range of services to address various tenant issues, from eviction defense and housing discrimination to illegal landlord practices and lease reviews. We understand the challenges tenants face and are here to provide the support and advocacy needed to navigate these complexities and ensure your rights are upheld.

        Our comprehensive services include defending against eviction notices, addressing housing discrimination under the Fair Housing Act, and holding landlords accountable for illegal practices such as harassment and discrimination. We offer thorough lease reviews and provide guidance on lease terminations to avoid unnecessary complications. Our team advocates for tenants'' rights to maintenance and repair, ensuring habitable living conditions, and assists with disputes related to rent overcharges, security deposits, and unlawful rent increases. We also support tenants facing retaliatory eviction, roommate disputes, and harassment, offering mediation and legal action when necessary. Additionally, we provide utility shutoff protection and support for tenant unions, helping you organize and advocate for better living conditions and fair treatment. At NCLS, we are dedicated to standing by your side and ensuring your rights as a tenant are protected every step of the way.',
  '["Eviction Defense: Facing an eviction notice or proceedings can be overwhelming. We have the expertise to defend your rights and guide you through the legal options available in North Carolina.","Housing Discrimination: If you''ve faced discrimination in housing based on race, color, national origin, religion, sex, familial status, or disability, we will fight to uphold your rights under the Fair Housing Act.","Illegal Landlord Practices: Discrimination, harassment, or any other unlawful behavior by a landlord is unacceptable. We hold landlords accountable for their actions and provide tenants with the necessary legal support.","Lease Review: Before signing any residential or commercial lease agreement, our team can review it and provide valuable feedback to ensure your interests are protected.","Lease Termination: Navigating the end of a lease can be complicated. We offer advice and support to help you handle lease terminations smoothly and avoid unnecessary complications or penalties.","Maintenance and Repair Advocacy: Every tenant has the right to a habitable living environment. If your landlord is neglecting essential repairs or you are living in substandard conditions, we can help you assert your rights and ensure necessary actions are taken.","Quiet Enjoyment Violations: Every tenant is entitled to the quiet enjoyment of their rental property. If this right is being violated, we can help you seek legal remedies.","Rent Overcharge & Deposit Disputes: If you believe you''ve been overcharged for rent or unfairly denied the return of your security deposit, we will work with you to challenge these actions and seek a favorable resolution.","Retaliatory Eviction : If you''re facing eviction as retaliation for exercising your tenant rights, we can defend you and make sure your rights are upheld.","Roommate Disputes: Disagreements between roommates can become serious issues. We provide mediation and legal advice to help resolve conflicts and protect your rights in shared living situations.","Tenant Harassment: No tenant should endure harassment from their landlord, whether it''s unwarranted entry, threats, or intimidation. We can help you take legal action to stop the harassment and safeguard your rights.","Tenant Union Support: We support tenant unions in their efforts to organize and advocate for better living conditions and fair treatment. Our legal expertise helps union members understand their rights and take effective collective action.","Unlawful Rent Increases: If your landlord has raised your rent illegally or without proper notice, we can help you challenge the increase and ensure compliance with rent control regulations.","Utility Shutoff Protection: If your landlord has unlawfully shut off your utilities, we can help you restore your services and hold your landlord accountable."]', '[]',
  'Schedule a consultation', '/schedule',
  NULL, NULL, '[]', 'LegalService',
  'Tenant Rights Law | North Carolina Legal Services', 'Navigating legal issues with your landlord can be complicated and stressful. We provide expert legal assistance to ensure that your rights are protected when resolving disputes with your landlord.', '/services/tenant-rights',
  'published', 4, 0,
  'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'offering_ncls_probate-and-estate', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'Probate and Estate Planning', 'probate-and-estate', 'Offer',
  'Estate planning and administration services', 'At NCLS, we are dedicated to helping you plan for the future and manage the affairs of your loved ones after they pass. We provide comprehensive legal services to ensure your wishes are respected and your family is taken care of.', 'At NCLS, we are dedicated to helping you plan for the future and manage the affairs of your loved ones after they pass. Our comprehensive legal services are designed to ensure your wishes are respected and your family is taken care of. We understand the importance of proper estate planning and are here to provide the guidance you need to protect your assets and ensure a smooth transition for your beneficiaries.

        Our services include asset protection, elder law, and comprehensive estate planning. We assist in drafting essential documents, planning for tax implications, and ensuring your assets are distributed according to your wishes. Our expertise extends to financial and medical powers of attorney, guardianships, living wills, and trusts. We provide specialized support in probate matters, guiding you through the complex process of administering an estate. Whether you need to create a will, establish guardianships, or navigate the probate process, NCLS is here to offer the legal support and guidance necessary to secure your future and the well-being of your loved ones.',
  '["Asset Protection: We help you develop strategies to protect your assets from creditors and ensure your wealth is preserved for future generations.","Elder Law: We provide specialized services to address the unique legal needs of seniors, including long-term care planning, Medicaid planning, and elder abuse prevention.","Estate Planning: Our comprehensive estate planning services include drafting documents, planning for tax implications, and ensuring your assets are distributed according to your wishes.","Financial Powers of Attorney: We can help draft legal documents that grant a trusted agent the power to make and execute financial decisions on your behalf.","Guardianships: We provide legal assistance in establishing guardianships for minors or incapacitated adults to ensure their care and protection.","Living Wills: We help you prepare a living will to outline your preferences for medical treatment and end-of-life care, ensuring your wishes are followed.","Medical Powers of Attorney: We can help draft legal documents that allow a trusted person to legally make decisions for you regarding your care if you are ill or incapacitated.","Probate: We can guide you through the multi-step process of administering an estate after the death of a loved one, ensuring all legal requirements are met.","Trusts: We can assist in creating various types of trusts to manage and protect your assets, minimize estate taxes, and ensure your wishes are carried out.","Wills: We can help you draft a Will to bequeath property, name the executor of your estate, designate guardianship of any minor children, and more."]', '[{"question":"What is probate?","answer":"Probate is the court process for handling a person''s estate after death. It involves validating the will (if there is one), appointing a personal representative, paying debts and taxes, and distributing remaining assets to heirs. Because missing deadlines or filings can create liability for the executor, legal help can make probate smoother and less stressful."},{"question":"Can I write my own will in North Carolina, and does it need to be notarized?","answer":"In North Carolina, a handwritten or typed will may be valid if it''s signed and properly witnessed. Notarization isn''t required, but a notarized ''self-proving affidavit'' can make probate much smoother. Because small mistakes can leave a will unenforceable, it''s best to have a lawyer review or draft it."},{"question":"What makes a will valid in NC?","answer":"A will is generally valid if it''s in writing, signed by the person making it, and witnessed by two competent adults. There are exceptions for handwritten or oral wills, but they are harder to prove in court. Errors in execution can cause major problems later, so legal guidance can help you avoid costly disputes."},{"question":"What''s the difference between a will and a trust?","answer":"A will takes effect after death and often requires probate, while a trust can manage assets during life and may help heirs avoid probate. The choice depends on goals, family circumstances, and the types of assets involved. An attorney can explain which option is the best fit for your needs."},{"question":"What is an irrevocable trust, and when would someone use one?","answer":"An irrevocable trust is a trust that generally cannot be changed once created. It is sometimes used for tax planning, asset protection, or Medicaid eligibility. Because these trusts limit flexibility and aren''t right for most families, legal advice is important before setting one up."},{"question":"Do I need a lawyer for probate in North Carolina?","answer":"Probate can be handled without an attorney, but the process involves detailed filings, notices, and deadlines that vary by county. Mistakes can create liability for the executor or delay distribution to heirs. Legal support can reduce stress and protect you from problems down the road."},{"question":"How long does probate usually take in NC?","answer":"Probate in North Carolina often takes six months to a year, depending on the size of the estate and whether disputes arise. Debt claims, tax filings, or family disagreements can make it take longer. A lawyer can help streamline the process and avoid unnecessary delays."},{"question":"What documents should I gather to start probate in NC?","answer":"Courts usually require the death certificate, the original will (if any), and an inventory of assets, debts, and heirs. Supporting documents like account statements, deeds, and insurance policies may also be needed. Having a lawyer organize these in advance can prevent rejected filings or missed deadlines."},{"question":"What happens if someone dies without a will in NC?","answer":"If a person dies without a will, North Carolina''s intestacy laws decide who inherits property, usually starting with spouses and children. This process still goes through probate and may not reflect the person''s wishes. Legal guidance can help families navigate the process and resolve disputes."},{"question":"Are handwritten (\"holographic\") wills valid in NC?","answer":"Handwritten wills can be valid in North Carolina if they meet strict requirements, such as being entirely in the testator''s handwriting. These wills are often challenged because they can be unclear or incomplete. Drafting a proper will with an attorney is far more reliable."},{"question":"How much does a simple will cost in North Carolina?","answer":"At NCLS, a straightforward will typically costs between $300 and $600. We determine fees using a sliding scale based on income and household size, with up to 50% discounts available for clients who qualify. By comparison, the average market rate for a simple will in North Carolina is about $600."}]',
  'Schedule a consultation', '/schedule',
  NULL, NULL, '[]', 'LegalService',
  'Probate and Estate Planning | North Carolina Legal Services', 'At NCLS, we are dedicated to helping you plan for the future and manage the affairs of your loved ones after they pass. We provide comprehensive legal services to ensure your wishes are respected and your family is taken care of.', '/services/probate-and-estate',
  'published', 5, 0,
  'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'offering_ncls_special-education-and-iep-advocacy', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'Special Education and IEP Advocacy', 'special-education-and-iep-advocacy', 'Offer',
  'Supporting families and communities', 'At NCLS, we are committed to supporting families navigating the Individualized Education Program (IEP) process and other special education services. Our team provides guidance and representation to ensure every child receives the educational support they are entitled to under the Individuals with Disabilities Education Act (IDEA), the Americans with Disabilities Act (ADA), Section 504, and more.', 'At NCLS, we are committed to supporting families navigating the Individualized Education Program (IEP) process and other special education services. Our team provides guidance and representation to ensure every child receives the educational support they are entitled to under the Individuals with Disabilities Education Act (IDEA), the Americans with Disabilities Act (ADA), Section 504, and more. We work alongside families at every stage, protecting student rights and promoting successful outcomes.',
  '["IEP Process Support and Advocacy: We offer support throughout the IEP process, from requesting evaluations to developing effective and individualized education plans. By working closely with parents, we help clarify goals and ensure that school districts fulfill their obligations under IDEA. We focus on securing necessary services and accommodations, creating a pathway for each student''s educational success.","Representation at IEP Meetings: Representation during IEP meetings can significantly impact a child''s educational plan. Our team advocates for each child''s needs at these meetings, ensuring that the school respects procedural safeguards and parents'' rights. With us at the table, families can feel confident that their child''s plan will reflect their unique needs and comply with all legal standards.","State Complaint Filing and Advocacy: If a school fails to meet IDEA requirements, such as by not providing necessary evaluations or services, a state complaint can address these procedural violations. We handle all aspects of filing state complaints, from gathering evidence to submitting detailed documentation to the Department of Public Instruction (DPI). We are committed to addressing any gaps in services, improving the educational experience for each child.","Due Process Hearings: For cases involving disputes over an IEP''s adequacy or other significant disagreements, we provide representation in due process hearings before the Office of Administrative Hearings (OAH). We assist families in building a strong case, supported by expert testimony and thorough documentation, to secure essential services or adjustments to the IEP that best support the student''s needs.","Section 504 Plan Development and Compliance: For students who do not qualify for an IEP but still need accommodations, we help families establish effective Section 504 Plans. Our team assists with all aspects of 504 Plan development, ensuring that schools provide necessary accommodations and meet compliance standards. We also address compliance issues when schools do not fulfill their obligations under Section 504.","Resolution Meetings and Mediation: Many special education issues can be resolved through resolution meetings or mediation, without the need for a formal hearing. We assist families by preparing documentation, setting clear goals, and advocating for effective resolutions that meet the student''s educational needs while avoiding prolonged disputes when possible.","Why Choose NCLS for Special Education Advocacy?: Navigating the special education process can be challenging, but our team is here to support you. Whether you need assistance with IEP development, meeting representation, state complaints, or due process hearings, we are dedicated to protecting your child''s educational rights and helping you secure the resources they need to succeed in school."]', '[]',
  'Schedule a consultation', '/schedule',
  NULL, NULL, '[]', 'LegalService',
  'Special Education and IEP Advocacy | North Carolina Legal Services', 'At NCLS, we are committed to supporting families navigating the Individualized Education Program (IEP) process and other special education services. Our team provides guidance and representation to ensure every child receives the educational support they are entitled to under the Individuals with Disabilities Education Act (IDEA), the Americans with Disabilities Act (ADA), Section 504, and more.', '/services/special-education-and-iep-advocacy',
  'published', 6, 0,
  'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO tenant_pages (
  id, organization_id, site_id, path, title, slug, page_type, summary, body,
  components_json, cta_label, cta_url, seo_title, seo_description, canonical_url,
  robots, status, sort_order, source, source_ref, created_at, updated_at
) VALUES
(
  'page_ncls_about', 'org-ncls-blawby', 'site-ncls-blawby',
  '/about', 'About North Carolina Legal Services', 'about',
  'about', 'North Carolina Legal Services is a non-profit law firm that offers legal services with income-based fees to assist individuals and families that earn too much to qualify for free legal assistance, but who cannot afford the high cost of traditional law firms.', 'Access to Justice for All. North Carolina''s affordable legal services. We believe that access to the Justice System is a fundamental right. At North Carolina Legal Services we are committed to removing financial barriers that prevent many in our community from obtaining high-quality legal assistance.

## Our Mission

At North Carolina Legal Services, we are committed to providing high-quality legal services at affordable rates for individuals, families, and small businesses.

## Our People

Our attorneys and staff are all experienced, mission-aligned, resourceful, and talented.

## Our Vision

Empowering our community through accessible and effective legal services.',
  '[]', NULL, NULL,
  'About | North Carolina Legal Services', 'North Carolina Legal Services is a non-profit law firm that offers legal services with income-based fees to assist individuals and families that earn too much to qualify for free legal assistance, but who cannot afford the high cost of traditional law firms.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_pricing', 'org-ncls-blawby', 'site-ncls-blawby',
  '/pricing', 'Pricing and Fees', 'pricing',
  'pricing', 'North Carolina Legal Services offers income-based rates ranging from $150-$225 per hour with income-based fees to assist individuals and families that earn too much to qualify for free legal assistance, but who cannot afford the high cost of traditional law firms.', 'North Carolina Legal Services offers income-based rates ranging from $160-$320 per hour to assist individuals and families that earn too much to qualify for free legal assistance, but who cannot afford the high cost of traditional law firms.

Use the table below to determine the applicable discount for your family size:

      1) Find Your Family Size: In the table, locate the row that matches the number of people in your household under the "Family Size" column. This includes yourself, your spouse or partner, and any dependents.

      2) Determine Your Income Level: Compare your household''s annual income to the income ranges in the table, under the columns "250% Federal Poverty Level," "350% Federal Poverty Level," and "400% Federal Poverty Level."

      Identify Your Discount:
      - If your household income is 250% or less of the Federal Poverty Level for your family size, you qualify for a 50% discount ($160/hr rate).
      - If your income is between 250% and 350% of the Federal Poverty Level, you qualify for a 33% discount ($215/hr rate).
      - If your income is between 350% and 400% of the Federal Poverty Level, you qualify for a 25% discount ($240/hr rate).
      - If your income exceeds 400% of the Federal Poverty Level for your family size, this sliding scale may not apply, and standard rates ($320/hr) may be in effect.',
  '[{"type":"pricing_calculator","title":"Sliding-scale fee estimator","note":"If your income falls below 250% of the Federal Poverty Level for your family size, you qualify for a 50% discount. Those with incomes between 250% and 350% receive a 33% discount, while individuals and families earning between 350% and 400% are eligible for a 25% discount. We understand that everyones situation is unique, and our goal is to ensure that you have access to the legal representation you deserve, regardless of your financial situation.","baseAmount":0,"perPersonAmount":0,"complexityStep":0,"source":"React NCLS priceTableComponent normalized by Blawby adapter","effectiveDate":null,"table":{"description":"Use the table below to determine the applicable discount for your family size:\n\n      1) Find Your Family Size: In the table, locate the row that matches the number of people in your household under the \"Family Size\" column. This includes yourself, your spouse or partner, and any dependents.\n\n      2) Determine Your Income Level: Compare your household''s annual income to the income ranges in the table, under the columns \"250% Federal Poverty Level,\" \"350% Federal Poverty Level,\" and \"400% Federal Poverty Level.\"\n\n      Identify Your Discount:\n      - If your household income is 250% or less of the Federal Poverty Level for your family size, you qualify for a 50% discount ($160/hr rate).\n      - If your income is between 250% and 350% of the Federal Poverty Level, you qualify for a 33% discount ($215/hr rate).\n      - If your income is between 350% and 400% of the Federal Poverty Level, you qualify for a 25% discount ($240/hr rate).\n      - If your income exceeds 400% of the Federal Poverty Level for your family size, this sliding scale may not apply, and standard rates ($320/hr) may be in effect.","notice":"If your income falls below 250% of the Federal Poverty Level for your family size, you qualify for a 50% discount. Those with incomes between 250% and 350% receive a 33% discount, while individuals and families earning between 350% and 400% are eligible for a 25% discount. We understand that everyones situation is unique, and our goal is to ensure that you have access to the legal representation you deserve, regardless of your financial situation.","columns":["Family Size","250% Federal Poverty Level","350% Federal Poverty Level","400% Federal Poverty Level"],"rows":[["1","$39,900","$55,860","$63,840"],["2","$54,100","$75,740","$86,560"],["3","$68,300","$95,620","$109,280"],["4","$82,500","$115,500","$132,000"],["5","$96,700","$135,380","$154,720"],["6","$110,900","$155,260","$177,440"],["7","$125,100","$175,140","$200,160"],["8","$139,300","$195,020","$222,880"]]}}]', NULL, NULL,
  'Pricing and Fees | North Carolina Legal Services', 'North Carolina Legal Services offers income-based rates ranging from $150-$225 per hour with income-based fees to assist individuals and families that earn too much to qualify for free legal assistance, but who cannot afford the high cost of traditional law firms.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_donate', 'org-ncls-blawby', 'site-ncls-blawby',
  '/donate', 'Support Equal Access to Justice', 'donate',
  'donate', 'Support equal access to justice in North Carolina. Your donation helps provide affordable legal services to families and individuals who need it most. Make a tax-deductible contribution to support our mission.', 'Support equal access to justice in North Carolina. Your donation helps provide affordable legal services to families and individuals who need it most. Make a tax-deductible contribution to support our mission.',
  '[]', 'Donate externally', 'https://app.blawby.com/northcarolinalegalservices/pay/donate',
  'Donate | North Carolina Legal Services', 'Support equal access to justice in North Carolina. Your donation helps provide affordable legal services to families and individuals who need it most. Make a tax-deductible contribution to support our mission.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_privacy', 'org-ncls-blawby', 'site-ncls-blawby',
  '/policies/privacy', 'Privacy Policy', 'policies-privacy',
  'privacy', 'Welcome to our website. By accessing and using this website, you agree to comply with and be bound by the following terms and conditions of use: The content of this website is for informational purposes only and is subject to change without notice.', 'This Privacy Policy describes how North Carolina Legal Services ("NCLS", "we", "us", or "our") collects, uses, and discloses information when you visit this website (the "Site") or otherwise communicate with us (collectively, the "Services").

Please read this Privacy Policy carefully. By using the Services, you agree to the collection, use, and disclosure of your information as described in this Privacy Policy.

### Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect changes to our practices or for other operational, legal, or regulatory reasons. We will post the revised Privacy Policy on the Site and update the "Last updated" date.

### Information We Collect

We collect information you provide directly to us, including:

*   Contact information you submit through our contact or consultation request forms, such as your name, email address, phone number, and a description of your legal matter.
*   Scheduling information when you book a consultation through our booking provider.
*   Communications you send us, including messages, attachments, or documents you choose to share.

We also automatically collect limited technical information about your visit to the Site, such as your browser type, device information, and pages viewed, through the analytics tool described below.

### How We Use Your Information

We use the information we collect to:

*   Respond to your inquiries and schedule consultations.
*   Evaluate whether we may be able to assist with your legal matter.
*   Communicate with you about your request or our services.
*   Maintain the security and proper functioning of the Site.
*   Understand, in aggregate, how visitors use the Site so we can improve it.

### Analytics

We use Google Tag Manager to understand how visitors use the Site. Analytics tracking on this Site is limited to an allowlisted set of events, such as page views and consultation button clicks, and does not include the content of any message you send us.

### How We Share Your Information

We do not sell your personal information. We may share it with:

*   Service providers who help us operate the Site and manage consultation scheduling, such as our booking and hosting providers, who are only permitted to use it to provide those services to us.
*   Legal or regulatory authorities where required by law.

### No Attorney-Client Relationship

Submitting a contact or consultation request does not create an attorney-client relationship. Information you submit before an attorney-client relationship is formed may not be treated as confidential or privileged. Please avoid sending sensitive details about your legal matter until we have confirmed representation.

### Data Retention

We retain the information you provide for as long as necessary to respond to your inquiry, provide services, and comply with our legal and recordkeeping obligations.

### Security

We use reasonable administrative and technical safeguards to protect the information you provide, but no method of transmission or storage is completely secure. Please avoid sending highly sensitive information through unsecured channels.

### Your Rights

Depending on where you live, you may have the right to request access to, correction of, or deletion of the personal information we hold about you. You can exercise these rights by contacting us using the details below.

### Children''s Data

The Services are not directed to children, and we do not knowingly collect personal information from children.

### Contact

Questions about this Privacy Policy or requests to exercise your rights can be sent to [contact@northcarolinalegalservices.org](mailto:contact@northcarolinalegalservices.org).',
  '[]', NULL, NULL,
  'Privacy Policy | North Carolina Legal Services', 'Welcome to our website. By accessing and using this website, you agree to comply with and be bound by the following terms and conditions of use: The content of this website is for informational purposes only and is subject to change without notice.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_terms', 'org-ncls-blawby', 'site-ncls-blawby',
  '/policies/terms', 'Terms of Use', 'policies-terms',
  'terms', 'Welcome to our website. By accessing and using this website, you agree to comply with and be bound by the following terms and conditions of use: The content of this website is for informational purposes only and is subject to change without notice.', '### Overview

This website is operated by North Carolina Legal Services ("NCLS", "we", "us", or "our"). Throughout the site, these terms refer to North Carolina Legal Services. By accessing or using this website, you agree to be bound by these Terms of Use ("Terms"). If you do not agree, please do not use the Site.

### Not Legal Advice

The content on this Site, including articles, service descriptions, and the pricing calculator, is provided for general informational purposes only and does not constitute legal advice. Using this Site or submitting a contact or consultation request does not create an attorney-client relationship between you and NCLS. An attorney-client relationship is only formed once we have confirmed representation in writing.

### Consultations and Scheduling

Consultation requests submitted through this Site are routed to our scheduling provider. Submitting a request does not guarantee that NCLS will be able to represent you; eligibility depends on factors such as conflicts, capacity, and the nature of your matter.

### Donations

Donations made through links on this Site are processed by an external payment provider. NCLS does not process or store payment card information directly.

### Site Use

You agree not to use the Site for any unlawful purpose, to transmit any virus or malicious code, or to attempt to interfere with the security or proper functioning of the Site.

### Accuracy of Information

We work to keep the information on this Site current, but we do not warrant that all content, including pricing and service descriptions, is accurate, complete, or up to date. We may update or correct information on the Site at any time without notice.

### Third-Party Links

This Site may link to third-party websites, including our scheduling and donation providers. We are not responsible for the content, policies, or practices of any third-party website.

### Disclaimer of Warranties; Limitation of Liability

The Site and its content are provided "as is" without warranties of any kind, express or implied. To the fullest extent permitted by law, NCLS and its directors, officers, employees, and agents will not be liable for any indirect, incidental, or consequential damages arising from your use of the Site.

### Governing Law

These Terms are governed by the laws of the State of North Carolina, without regard to its conflict-of-law principles.

### Changes to These Terms

We may update these Terms from time to time by posting the revised version on this page. Your continued use of the Site after changes are posted constitutes acceptance of those changes.

### Contact

Questions about these Terms can be sent to [contact@northcarolinalegalservices.org](mailto:contact@northcarolinalegalservices.org).',
  '[]', NULL, NULL,
  'Terms of Service | North Carolina Legal Services', 'Welcome to our website. By accessing and using this website, you agree to comply with and be bound by the following terms and conditions of use: The content of this website is for informational purposes only and is subject to change without notice.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'page_ncls_third-party', 'org-ncls-blawby', 'site-ncls-blawby',
  '/third-party-notices', 'Third-Party Notices', 'third-party-notices',
  'third-party', 'The following sets forth attribution notices for third party legal services that may be contacted if outside North Carolina Legal Services service area.', '### [Inner Banks Legal Services](https://ibxlegal.org)

Email: [info@ibxlegal.org](mailto:info@ibxlegal.org)

Phone: [(252) 495-0585](tel:+12524950585)

Services:

*   Business
*   Domestic Violence
*   Estates
*   Family
*   Finance
*   Guardianship

### [Legal Aid of North Carolina](https://www.legalaidnc.org/)

Phone: [1-866-219-5262](tel:+18662195262)

Address: 224 South Dawson Street, Raleigh, NC 27601

Services include but are not limited to:
*   Medicaid Appeals and Disputes
*   Eviction Assistance
*   Consumer Protection
*   Domestic Violence/Sexual Assault
*   Special Education
*   Employment
*   Senior 
*   Public Benefits
*   Veterans',
  '[]', NULL, NULL,
  'Third Party Notices | North Carolina Legal Services', 'The following sets forth attribution notices for third party legal services that may be contacted if outside North Carolina Legal Services service area.', NULL, NULL,
  'published', 0, 'react-adapter', 'react-next-marketing-site-template/northcarolinalegalservices', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO tenant_compliance (
  id, organization_id, site_id, entity_name, dba_name, entity_type, nonprofit_status,
  registration_number, service_area, disclaimer, footer_disclaimer, document_asset_ids,
  metadata_json, created_at, updated_at
) VALUES (
  'compliance_ncls', 'org-ncls-blawby', 'site-ncls-blawby',
  'North Carolina Legal Services', 'Bull City Legal Services', 'LegalService',
  '501(c)(3)', NULL, 'North Carolina',
  '*DISCLAIMER: The purpose of this website is informational - no
              attorney-client relationship is created by using this website or
              reading this blog. No legal advice is intended. If you have
              questions about a current or potential legal problem, you should
              always contact an attorney directly for specific advice. Results
              described on this website are meant to describe the work and
              experience of our Firm. The uncertainty & risk inherent in
              litigation, as well as the specific individual details of each
              case mean that results or a particular outcome are never
              guaranteed. This website is provided "as is," without any warranty
              of any kind, express or implied.', 'Access to Justice for All. We believe that access to the justice system is a fundamental right. At North Carolina Legal Services, we are committed to removing financial barriers that prevent many in our community from obtaining high-quality legal assistance.




  North Carolina Legal Services is a registered [**DBA**](https://media.krabiclaw.com/sites/site-ncls-blawby/media/legal/NorthCarolinaLegalServices_DBA__Redacted.pdf) of Bull City Legal Services. See our [**IRS Determination Letter**](https://media.krabiclaw.com/sites/site-ncls-blawby/media/legal/FinalLetter_88-0565637_BULLCITYLEGALSERVICESINC_Redacted.pdf). All rights reserved.',
  '["asset_ncls_legal_northcarolinalegalservices-dba-redacted","asset_ncls_legal_finalletter-88-0565637-bullcitylegalservicesinc-redacted"]', '{"founder":"Rich Gittings","foundingDate":null,"languages":["English"],"keywords":["North Carolina Legal Services","North Carolina Lawyer","North Carolina Law Firm","Family Law Attorney","Employment Law Consultation","Probate Services NC","Tenant Rights Lawyer","Small Business Legal Advice","Legal Counsel NC"]}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO site_consultation_settings (
  id, organization_id, site_id, mode, cta_label, external_url, schedule_path,
  confirmation_path, tracking_enabled, metadata_json, created_at, updated_at
) VALUES (
  'consultation_ncls', 'org-ncls-blawby', 'site-ncls-blawby',
  'external_url', 'Schedule a consultation',
  'https://ncls.cliogrow.com/book', '/schedule',
  '/contact/confirmed',
  1,
  '{"source":"react-next-marketing-site-template/northcarolinalegalservices","analyticsBridge":{"provider":"gtm","container_id":"GTM-MDHRQP5","allowed_events":["page_view","book_consultation_click","contact_submit"],"allowed_properties":["event","page_type","page_path","cta_destination","tenant"],"custom_head_code_ignored":true}}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO site_theme_tokens (id, organization_id, site_id, template_slug, tokens_json, status, created_at, updated_at)
VALUES ('theme-ncls-blawby', 'org-ncls-blawby', 'site-ncls-blawby', 'blawby', '{"bg":"#fbfaf7","surface":"#ffffff","primary":"#25356c","primaryDark":"#161f3b","accent":"#c19855","accentStrong":"#a37732","border":"#e7ddcc","ink":"#162033","fonts":["https://fonts.googleapis.com/css2?family=Marcellus&family=Poppins:wght@400;600&display=swap"]}', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO tenant_navigation_items (
  id, organization_id, site_id, area, label, url, item_type, sort_order, status, metadata_json, created_at, updated_at
) VALUES
(
  'nav_ncls_header_0', 'org-ncls-blawby', 'site-ncls-blawby',
  'header', 'Services', '/services',
  'internal', 0,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_header_1', 'org-ncls-blawby', 'site-ncls-blawby',
  'header', 'Pricing', '/pricing',
  'internal', 1,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_header_2', 'org-ncls-blawby', 'site-ncls-blawby',
  'header', 'Articles', '/blog',
  'internal', 2,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_header_3', 'org-ncls-blawby', 'site-ncls-blawby',
  'header', 'Donate', '/donate',
  'internal', 3,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_header_4', 'org-ncls-blawby', 'site-ncls-blawby',
  'header', 'Contact', '/contact',
  'internal', 4,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_legal_5', 'org-ncls-blawby', 'site-ncls-blawby',
  'legal', 'Privacy', '/policies/privacy',
  'internal', 5,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_legal_6', 'org-ncls-blawby', 'site-ncls-blawby',
  'legal', 'Terms', '/policies/terms',
  'internal', 6,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
),
(
  'nav_ncls_legal_7', 'org-ncls-blawby', 'site-ncls-blawby',
  'legal', 'Third-Party Notices', '/third-party-notices',
  'internal', 7,
  'active', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO media_assets (
  id, organization_id, site_id, location_id, kind, provider, source,
  cloudflare_image_id, r2_key, google_media_name, public_url, thumbnail_url,
  mime_type, file_name, file_size, width, height, duration, alt_text,
  category, status, created_by_user_id, created_at, updated_at, delete_pending_at
) VALUES
(
  'asset_ncls_brand_logo_logo', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/logo.webp', NULL, 'image/webp',
  'logo.webp',
  NULL, NULL, NULL, NULL, 'brand_logo',
  'logo', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_tenant_feature_icon_mission', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'file',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/files/mission.svg', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/files/mission.svg', NULL, 'image/svg+xml',
  'mission.svg',
  NULL, NULL, NULL, NULL, 'tenant_feature_icon',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_tenant_feature_icon_people', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'file',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/files/people.svg', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/files/people.svg', NULL, 'image/svg+xml',
  'people.svg',
  NULL, NULL, NULL, NULL, 'tenant_feature_icon',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_tenant_feature_icon_vision', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'file',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/files/vision.svg', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/files/vision.svg', NULL, 'image/svg+xml',
  'vision.svg',
  NULL, NULL, NULL, NULL, 'tenant_feature_icon',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_thumbnail_family-law', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/family-law.webp', NULL, 'image/webp',
  'family-law.webp',
  NULL, NULL, NULL, NULL, 'offering_thumbnail',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_divorce-in-nc-01', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/divorce-in-nc-01.webp', NULL, 'image/webp',
  'divorce-in-nc-01.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_divorce-in-nc-02', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/divorce-in-nc-02.webp', NULL, 'image/webp',
  'divorce-in-nc-02.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_divorce-in-nc-03', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/divorce-in-nc-03.webp', NULL, 'image/webp',
  'divorce-in-nc-03.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_divorce-in-nc-04', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/divorce-in-nc-04.webp', NULL, 'image/webp',
  'divorce-in-nc-04.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_divorce-in-nc-05', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/divorce-in-nc-05.webp', NULL, 'image/webp',
  'divorce-in-nc-05.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_divorce-in-nc-06', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/divorce-in-nc-06.webp', NULL, 'image/webp',
  'divorce-in-nc-06.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_divorce-in-nc-07', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/divorce-in-nc-07.webp', NULL, 'image/webp',
  'divorce-in-nc-07.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_alimony', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/alimony.webp', NULL, 'image/webp',
  'alimony.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_childcustody', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/childcustody.webp', NULL, 'image/webp',
  'childcustody.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_childsupport', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/childsupport.webp', NULL, 'image/webp',
  'childsupport.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_custodial-power-of-attorney', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/custodial-power-of-attorney.webp', NULL, 'image/webp',
  'custodial-power-of-attorney.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_divorce', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/divorce.webp', NULL, 'image/webp',
  'divorce.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_custody-evaluations', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/custody-evaluations.webp', NULL, 'image/webp',
  'custody-evaluations.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_prenuptialagreement', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/prenuptialagreement.webp', NULL, 'image/webp',
  'prenuptialagreement.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_separationagreement', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/separationagreement.webp', NULL, 'image/webp',
  'separationagreement.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_equitabledistribution', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/equitabledistribution.webp', NULL, 'image/webp',
  'equitabledistribution.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_domesticviolenceprotectiveorder', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/domesticviolenceprotectiveorder.webp', NULL, 'image/webp',
  'domesticviolenceprotectiveorder.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_visitation', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/visitation.webp', NULL, 'image/webp',
  'visitation.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_enforcementofcourtorders', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/enforcementofcourtorders.webp', NULL, 'image/webp',
  'enforcementofcourtorders.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_mediationservices', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/mediationservices.webp', NULL, 'image/webp',
  'mediationservices.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_thumbnail_small-business', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/small-business.webp', NULL, 'image/webp',
  'small-business.webp',
  NULL, NULL, NULL, NULL, 'offering_thumbnail',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_small-business-01', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/small-business-01.webp', NULL, 'image/webp',
  'small-business-01.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_small-business-02', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/small-business-02.webp', NULL, 'image/webp',
  'small-business-02.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_small-business-03', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/small-business-03.webp', NULL, 'image/webp',
  'small-business-03.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_small-business-04', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/small-business-04.webp', NULL, 'image/webp',
  'small-business-04.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_small-business-05', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/small-business-05.webp', NULL, 'image/webp',
  'small-business-05.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_small-business-06', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/small-business-06.webp', NULL, 'image/webp',
  'small-business-06.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_small-business-07', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/small-business-07.webp', NULL, 'image/webp',
  'small-business-07.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_small-business-08', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/small-business-08.webp', NULL, 'image/webp',
  'small-business-08.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_small-business-09', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/small-business-09.webp', NULL, 'image/webp',
  'small-business-09.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_arbitration-mediation', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/Arbitration_mediation.webp', NULL, 'image/webp',
  'Arbitration_mediation.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_businessentityformation', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/businessentityformation.webp', NULL, 'image/webp',
  'businessentityformation.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_compliance', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/compliance.webp', NULL, 'image/webp',
  'compliance.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_commercial-litigation', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/commercial-litigation.webp', NULL, 'image/webp',
  'commercial-litigation.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_contracts', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/contracts.webp', NULL, 'image/webp',
  'contracts.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_employment-law', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/employment-law.webp', NULL, 'image/webp',
  'employment-law.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_nonprofit-formation-and-governance', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/nonprofit-formation-and-governance.webp', NULL, 'image/webp',
  'nonprofit-formation-and-governance.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_partnership-agreements', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/partnership-agreements.webp', NULL, 'image/webp',
  'partnership-agreements.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_real-estate-transactions', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/real-estate-transactions.webp', NULL, 'image/webp',
  'real-estate-transactions.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_risk-management', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/risk-management.webp', NULL, 'image/webp',
  'risk-management.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_shareholder-agreements', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/shareholder-agreements.webp', NULL, 'image/webp',
  'shareholder-agreements.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_child-support-modification', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/child-support-modification.webp', NULL, 'image/webp',
  'child-support-modification.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_taxation', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/taxation.webp', NULL, 'image/webp',
  'taxation.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_thumbnail_employment', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/employment.webp', NULL, 'image/webp',
  'employment.webp',
  NULL, NULL, NULL, NULL, 'offering_thumbnail',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_breach-of-employment-contract', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/Breach-of-Employment-Contract.webp', NULL, 'image/webp',
  'Breach-of-Employment-Contract.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_civil-rights-violations', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/Civil-Rights-Violations.webp', NULL, 'image/webp',
  'Civil-Rights-Violations.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_contract-and-agreement-disputes', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/contract-and-agreement-disputes.webp', NULL, 'image/webp',
  'contract-and-agreement-disputes.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_defamation', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/defamation.webp', NULL, 'image/webp',
  'defamation.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_employee-benefits-and-rights', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/employee-benefits-and-rights.webp', NULL, 'image/webp',
  'employee-benefits-and-rights.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_fmla-violations', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/FMLA-violations.webp', NULL, 'image/webp',
  'FMLA-violations.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_harassment', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/harassment.webp', NULL, 'image/webp',
  'harassment.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_military-leave', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/military-leave.webp', NULL, 'image/webp',
  'military-leave.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_privacy-rights-at-the-workplace', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/privacy-rights-at-the-workplace.webp', NULL, 'image/webp',
  'privacy-rights-at-the-workplace.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_retaliation-and-whistleblower-claims', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/retaliation-and-whistleblower-claims.webp', NULL, 'image/webp',
  'retaliation-and-whistleblower-claims.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_union-rights-and-collective-bargining', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/union-rights-and-collective-bargining.webp', NULL, 'image/webp',
  'union-rights-and-collective-bargining.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_wage-and-hour-disputes', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/wage-and-hour-disputes.webp', NULL, 'image/webp',
  'wage-and-hour-disputes.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_workers-compensation-claims', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/workers-compensation-claims.webp', NULL, 'image/webp',
  'workers-compensation-claims.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_workplace-safety-and-osha-violations', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/workplace-safety-and-OSHA-violations.webp', NULL, 'image/webp',
  'workplace-safety-and-OSHA-violations.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_wrongful-termination', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/wrongful-termination.webp', NULL, 'image/webp',
  'wrongful-termination.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_thumbnail_tenant-rights', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/tenant-rights.webp', NULL, 'image/webp',
  'tenant-rights.webp',
  NULL, NULL, NULL, NULL, 'offering_thumbnail',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_eviction-defense', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/eviction-defense.webp', NULL, 'image/webp',
  'eviction-defense.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_housing-discrimination', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/housing-discrimination.webp', NULL, 'image/webp',
  'housing-discrimination.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_illegal-landlord-practices', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/illegal-landlord-practices.webp', NULL, 'image/webp',
  'illegal-landlord-practices.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_lease-review', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/lease-review.webp', NULL, 'image/webp',
  'lease-review.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_lease-termination', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/lease-termination.webp', NULL, 'image/webp',
  'lease-termination.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_maintenance-and-repair-advocacy', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/Maintenance-and-Repair-Advocacy.webp', NULL, 'image/webp',
  'Maintenance-and-Repair-Advocacy.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_quiet-enjoyment-violations', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/quiet-enjoyment-violations.webp', NULL, 'image/webp',
  'quiet-enjoyment-violations.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_rent-overcharge-and-deposit-disputes', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/rent-overcharge-and-deposit-disputes.webp', NULL, 'image/webp',
  'rent-overcharge-and-deposit-disputes.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_retaliatory-eviction', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/retaliatory-eviction.webp', NULL, 'image/webp',
  'retaliatory-eviction.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_roommate-disputes', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/roommate-disputes.webp', NULL, 'image/webp',
  'roommate-disputes.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_tenant-harassment', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/tenant-harassment.webp', NULL, 'image/webp',
  'tenant-harassment.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_tenant-union-support', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/tenant-union-support.webp', NULL, 'image/webp',
  'tenant-union-support.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_unlawful-rent-increases', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/unlawful-rent-increases.webp', NULL, 'image/webp',
  'unlawful-rent-increases.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_utility-shutof-protection', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/utility-shutof-protection.webp', NULL, 'image/webp',
  'utility-shutof-protection.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_thumbnail_probate', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/probate.webp', NULL, 'image/webp',
  'probate.webp',
  NULL, NULL, NULL, NULL, 'offering_thumbnail',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_wills-01', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/wills-01.webp', NULL, 'image/webp',
  'wills-01.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_wills-02', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/wills-02.webp', NULL, 'image/webp',
  'wills-02.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_wills-03', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/wills-03.webp', NULL, 'image/webp',
  'wills-03.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_wills-04', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/wills-04.webp', NULL, 'image/webp',
  'wills-04.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_wills-05', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/wills-05.webp', NULL, 'image/webp',
  'wills-05.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_media_wills-06', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/wills-06.webp', NULL, 'image/webp',
  'wills-06.webp',
  NULL, NULL, NULL, NULL, 'offering_media',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_asset-protection', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/asset-protection.webp', NULL, 'image/webp',
  'asset-protection.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_elder-law', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/elder-law.webp', NULL, 'image/webp',
  'elder-law.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_estate-planning', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/estate-planning.webp', NULL, 'image/webp',
  'estate-planning.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_financial-power-of-attorney', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/financial-power-of-attorney.webp', NULL, 'image/webp',
  'financial-power-of-attorney.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_guardianships', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/guardianships.webp', NULL, 'image/webp',
  'guardianships.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_living-will', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/living-will.webp', NULL, 'image/webp',
  'living-will.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_medical-power-of-attorney', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/medical-power-of-attorney.webp', NULL, 'image/webp',
  'medical-power-of-attorney.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_probate-feature', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/probate-feature.webp', NULL, 'image/webp',
  'probate-feature.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_trusts', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/trusts.webp', NULL, 'image/webp',
  'trusts.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_feature_wills', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/wills.webp', NULL, 'image/webp',
  'wills.webp',
  NULL, NULL, NULL, NULL, 'offering_feature',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_offering_thumbnail_special-education', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/special-education.webp', NULL, 'image/webp',
  'special-education.webp',
  NULL, NULL, NULL, NULL, 'offering_thumbnail',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_article_image_getting-a-divorce-in-north-carolina', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/getting_a_divorce_in_north_carolina.webp', NULL, 'image/webp',
  'getting_a_divorce_in_north_carolina.webp',
  NULL, NULL, NULL, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_article_image_equitable-distribution-in-north-carolina-divorces', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'image',
  'cloudflare_images',
  'uploaded', NULL, NULL, NULL,
  'https://images.krabiclaw.com/sites/site-ncls-blawby/media/images/equitable_distribution_in_north_carolina_divorces.webp', NULL, 'image/webp',
  'equitable_distribution_in_north_carolina_divorces.webp',
  NULL, NULL, NULL, NULL, 'article_image',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_legal_northcarolinalegalservices-dba-redacted', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'file',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/legal/NorthCarolinaLegalServices_DBA__Redacted.pdf', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/legal/NorthCarolinaLegalServices_DBA__Redacted.pdf', NULL, 'application/pdf',
  'NorthCarolinaLegalServices_DBA__Redacted.pdf',
  NULL, NULL, NULL, NULL, 'dba_registration',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
),
(
  'asset_ncls_legal_finalletter-88-0565637-bullcitylegalservicesinc-redacted', 'org-ncls-blawby', 'site-ncls-blawby', NULL,
  'file',
  'cloudflare_r2',
  'uploaded', NULL, 'sites/site-ncls-blawby/media/legal/FinalLetter_88-0565637_BULLCITYLEGALSERVICESINC_Redacted.pdf', NULL,
  'https://media.krabiclaw.com/sites/site-ncls-blawby/media/legal/FinalLetter_88-0565637_BULLCITYLEGALSERVICESINC_Redacted.pdf', NULL, 'application/pdf',
  'FinalLetter_88-0565637_BULLCITYLEGALSERVICESINC_Redacted.pdf',
  NULL, NULL, NULL, NULL, 'legal_document',
  'other', 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
);

INSERT INTO blog_posts (
  id, organization_id, site_id, title, slug, body, excerpt, category, status,
  author_id, featured_image_asset_id, published_at, created_at, updated_at,
  seo_description, seo_keywords, canonical_url, robots
) VALUES
(
  'blog_ncls_getting-a-divorce-in-north-carolina', 'org-ncls-blawby', 'site-ncls-blawby',
  'Getting a Divorce in North Carolina', 'getting-a-divorce-in-north-carolina', '## Divorce Requirements and First Steps

The legal term for a divorce in North Carolina is "absolute divorce." Spouses can only be eligible to file for divorce if they have been separated for [at least one year](https://ncleg.gov/EnactedLegislation/Statutes/PDF/BySection/Chapter_50/GS_50-6.pdf). Separated, in this context, means that each spouse must have lived apart from the other and that one or both spouses meant for the separation to be permanent. It is not enough for the spouses to remain in the same residence with one staying "downstairs" and one staying "upstairs" or something similar. You each must be in a separate residence for the entire year. You or your spouse must also have lived in North Carolina for at least six months prior to filing for divorce.

Unlike many other states that allow spouses to file a divorce based on fault grounds, North Carolina only allows no-fault divorces. Specifically, the eligibility for divorce is based on [one year](https://ncleg.gov/EnactedLegislation/Statutes/PDF/BySection/Chapter_50/GS_50-5.1.pdf) of separation or incurable insanity.

## Filing for a Divorce in North Carolina

There are numerous documents and processes required to initiate a divorce. The first step is to draft and file a complaint. Divorce complaints list the details of your case and state that you are requesting an absolute divorce. It should also include whether you are requesting equitable distribution, post-separation support, alimony, or spousal support. The EARLIEST date either spouse may file for absolute divorce is one year plus one day. There is no standardized form used for complaints; they must be drafted from scratch.

Other important elements of an initial filing are the civil summons, which will be served on your spouse, and a Domestic Civil Action Cover Sheet. There is also a federal law that requires you to submit a declaration along with your complaint. This declaration discloses your spouse''s military enlistment or active-duty status.

Courts charge a filing fee for divorce complaints, and there may be an additional fee to have your spouse served with the divorce papers. At this time, the filing fee is $225, and the cost for the sheriff to serve the other spouse WITHIN the State of North Carolina is $30. The cost is different if you need to serve your spouse by sheriff outside of North Carolina.

## Spousal Support and North Carolina Divorces

Spousal support, also called post-separation support and alimony, is financial support paid to a dependent spouse during the separation period or following a divorce. If one spouse made considerably less money than the other or made no income and were financially dependent on their husband or wife, they will likely be considered a dependent spouse for the purposes of alimony.

There is no strict guideline or statutory formula for calculating spousal support. Instead, a judge will consider the specific details of each party''s finances, non-financial contributions, behavior during the marriage, and numerous other factors to determine alimony payments. Other factors a judge will likely consider include:

- The length of the marriage
- The age and health of both spouses
- The needs of each spouse
- The earning capacity of each spouse
- Property and assets owned by each spouse

Marital misconduct can affect alimony. If the supporting spouse engaged in infidelity, drug or alcohol abuse, cruelty, or other misconduct, this will be factored into the judge''s decision. Dependent spouses who cheated during the marriage may lose their right to receive spousal support.

Post-separation support and alimony claims must be requested and properly filed before the divorce is finalized. Failing to do so will mean that you forever lose the right to request spousal support from the court.

Alimony can last for a year, a decade, or a lifetime. Essentially, there are no statutory time periods for spousal support. A judge can award support to a dependent spouse that ends after they have time to get on their feet financially or require the supporting spouse to make alimony payments until one of the following occurs:

- Death of either spouse
- Remarriage or cohabitation of the dependent spouse
- A substantial change in circumstances

## Equitable Distribution

Equitable distribution must be requested and properly filed before the divorce is finalized. Failing to do so will mean that you forever lose the right to have your property divided by the court.

Marital property in North Carolina is eligible for equitable distribution, while separate property is not. Classifying assets and debts into these categories is often complex, but the general rule is that separate property is anything owned prior to marriage, and marital property is acquired during the marriage with funds earned during the marriage by either spouse. There are numerous exceptions to this rule. A third category called divisible property may also be important if you or your spouse acquired relevant property after separating but before finalizing the divorce.

The default in North Carolina is to divide property 50/50, but judges can decide that deviation from an even split is equitable for spouses. When evaluating property and equitable distribution, the court will consider, among other things, the following:

- Income and earning capacity of each spouse
- Property and debt of both spouses
- Tax implications
- The length of the marriage

## Divorce with Children

The court will also consider any custody, visitation, and child support matters during your divorce.

### Child Custody and Visitation

There are two types of custody – physical and legal. Legal custody refers to whether one or both parents have the right to make important decisions in their child''s life, such as education and healthcare. Physical custody refers to having the child physically in your care and is often what is meant when discussing which parent the child lives with primarily. Legal and physical custody can be granted solely to one parent or be shared between both.

Numerous factors go into deciding custody and visitation arrangements, but the primary consideration is the child''s best interest. You or your spouse can file for custody during the separation or have it be decided as part of the divorce.

### Child Support

Parents are responsible for financially supporting their children, and child support may be ordered even in joint custody arrangements. North Carolina uses the North Carolina Child Support Guidelines to calculate the amount of support one parent will pay to the other, and those guidelines include factors like the gross income of both parents, custody arrangements, cost of work-related childcare, health insurance for the children, and other support obligations.

## Separation Agreements

Separation agreements are not required to be considered legally separated in North Carolina. However, they are useful for establishing terms for your separation and addressing potentially contentious issues that may arise later on. These written agreements are contracts between spouses and can include topics like spousal support, child custody, possession of the marital home, and division of bank accounts. If desired, the separation agreement can be made a part of the final divorce order. This is referred to as "incorporating the separation agreement into the divorce."

## FAQs About North Carolina Divorce

- **Do both spouses have to want a divorce?**  
  No, North Carolina does not require that both spouses agree to the divorce. You can file for divorce if you meet the previously discussed requirements without permission or agreement from your husband or wife. You are required to serve notice to your spouse of the divorce, but they do not need to consent.

- **My spouse and I slept together after separation. Does that mean the one-year separation period restarts?**  
  Not necessarily. North Carolina law states that ["isolated incidents of sexual intercourse between parties"](https://ncleg.gov/EnactedLegislation/Statutes/PDF/BySection/Chapter_50/GS_50-6.pdf) do not pause or restart the separation period required for divorce. However, if the totality of the circumstances suggests that a resumption of marital relations has occurred, the separation may be considered to have ended. This would involve a renewal of the spousal relationship, not just isolated incidents of physical intimacy. If renewal of the spousal relationship happens, the one-year period must be restarted from the beginning.

- **Can I file for an expedited divorce if I can prove my spouse cheated?**  
  Infidelity does not affect the divorce timeline because North Carolina only allows for no-fault divorces. The requirement for these no-fault divorces is one year of separation. This isn''t to say that the behavior of a husband or wife has no effect on a North Carolina divorce, but it does not speed up the process.

- **What is a divorce from bed and board?**  
  A Divorce from Bed and Board is not actually considered a true divorce in North Carolina. It is more closely related to separation and is only available in limited situations. If your spouse committed marital misconduct, you might be able to receive a Divorce from Bed and Board. To be eligible for an absolute divorce, you will still need to stay separated for at least one year.

- **Can I change my last name as part of my divorce?**  
  Yes, you can make a request in your divorce complaint to resume the use of your maiden name. Your divorce judgment will include an order that allows you to change your name as part of the divorce.

- **My spouse and I have a high combined income. How will child support be calculated?**  
  In cases where the combined income of both spouses exceeds $40,000 per month, the Child Support Guidelines are not used. Instead, the court will consider the reasonable needs of the child in regard to things like education, standard of living, and health. The Guidelines may be used to determine a minimum in these cases, but they will not be the only tool a judge uses to set support.

**North Carolina Family Law Attorney**

Navigating this process without assistance from an experienced family law attorney can seem impossible. If you still have questions about your North Carolina divorce or separation, contact [North Carolina Legal Services](https://www.northcarolinalegalservices.org/services/family).
',
  'Going through a divorce is one of the most emotionally taxing and stressful situations that many people will go through in their lives. Part of the difficulty in facing the divorce process lies in the uncertainty of what''s to come and confusion about what is required. This guide to North Carolina divorce is intended to be a helpful resource for answers to many of the most common questions people have about divorce and separation while also clarifying some of the legal requirements in the state.', 'Legal Services', 'published',
  'user-ncls-blawby', NULL,
  '2026-01-01T12:00:00.000Z',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Going through a divorce is one of the most emotionally taxing and stressful situations that many people will go through in their lives. Part of the difficulty in facing the divorce process lies in the uncertainty of what''s to come and confusion about what is required. This guide to North Carolina divorce is intended to be a helpful resource for answers to many of the most common questions people have about divorce and separation while also clarifying some of the legal requirements in the state.', 'North Carolina Divorce Process, Divorce Procedure in NC, How to File for Divorce in NC, NC Divorce Laws, Divorce Paperwork North Carolina, Divorce Legal Advice NC, NC Divorce Requirements, Separation in North Carolina, Family Law Attorney NC, Divorce Settlements in North Carolina, Child Custody in NC Divorce, NC Alimony Rules, Understanding Divorce in NC, North Carolina Divorce FAQ, DIY Divorce North Carolina, Equitable Distribution NC, North Carolina Legal Services',
  '/article/getting-a-divorce-in-north-carolina', NULL
),
(
  'blog_ncls_equitable-distribution-in-north-carolina-divorces', 'org-ncls-blawby', 'site-ncls-blawby',
  'Equitable Distribution in North Carolina Divorces', 'equitable-distribution-in-north-carolina-divorces', '
## What is Equitable Distribution Law in North Carolina?

The purpose of equitable distribution is to decide how to divide a divorcing couple''s property and debts in a just and fair way. It isn''t an automatic process; one or both spouses must request it during the separation period. Additionally, in North Carolina, equitable distribution must be requested prior to the finalization of the divorce. You may lose your ability to have court involvement for property division if you do not have a pending claim for equitable distribution at the time the divorce is granted.

North Carolina General Statute § 50-20 outlines the distribution of marital and divisible property, including the definitions of marital, separate, and divisible property. These terms will be important during the equitable distribution process and hearing because not all property can be divided.

## Assets and Debts in a North Carolina Divorce

Assets and debts are divided into one of three categories: marital property, separate property, or divisible property. [Marital property](https://www.ncleg.net/EnactedLegislation/Statutes/HTML/BySection/Chapter_50/GS_50-20.html) is any real or personal property bought or acquired by either or both spouses during the marriage and before separation using funds earned during  the marriage. Marital assets and debts can be divided prior to divorce or after the divorce is final SO LONG AS there is a properly-filed pending claim for equitable distribution. The default in North Carolina is to assume that any asset or debt acquired during this timeframe is marital property unless it meets the criteria for separate property.

[Separate property](https://www.ncleg.net/EnactedLegislation/Statutes/HTML/BySection/Chapter_50/GS_50-20.html) can be acquired prior to the marriage or during the marriage if by inheritance or gift. It is important to note that gifts from one spouse to the other only count as separate property if there was a clear intention for the property to be separate. Otherwise, the gift from one spouse to another is considered marital property. Other classification requirements for separate property:

* Assets acquired in exchange for separate property will remain separate so long as the initial separate property is traceable.  For instance, an inheritance deposited into the joint bank account with no way to separate the inheritance portion from the marital portion will become marital property.  One spouse using an inheritance to buy a piece of specific property such as an automobile continues to own the new property as separate property.  Beware that an inheritance paid toward a marital residence owned by both parties is considered a gift to the marriage unless there is a specific directive otherwise at the time the inheritance is paid toward the marital residence.

* Income derived from separate property is also considered separate property unless the spouse owning the separate property is using his marital time and efforts to acquire the income.  Any passive income derived from separate property remains separate property unless an action is taken which purposely or inadvertently changes it to marital property.

* Professional and business licenses that terminate on transfer are separate property

Separate property is not eligible for division in North Carolina equitable distribution because it is considered to belong to only one spouse, however, the court can distribute the separate property directly to the spouse owning the separate property. The spouses may, and often do, disagree with how property is classified and whether it should be subject to equitable distribution.

Lastly, divisible property may be subject to equitable distribution. This type of property consists of increases or decreases in the value of assets and debts which are marital property.  Passive changes in value, i.e., the value of the marital residence or other marital property increases or decreases in value due simply to the fluctuation in the market, are considered to be marital so that each party is entitled to receive the value of one-half of such increase or decrease. t  If the increase or decrease was directly caused by a spouse''s efforts, i.e., one spouse used his separate funds and efforts to remodel the marital home or the spouse''s actions which decrease the value by not caring for the property, such change in value belongs solely to the spouse using his efforts or neglect. Some types of passive income and passive changes to marital debt could also qualify as divisible property.

## Marital Property Division in North Carolina

North Carolina law states that marital property and the net value of divisible property shall be equally divided unless that solution is not equitable. Equitable distribution does not mean a 50/50 split will go to each spouse. Either spouse is entitled to request more than 50 percent of the marital estate but, oftentimes, the spouses'' reasons are not sufficient to cause the court to distribute the property other than 50/50.   When deciding on marital property division in North Carolina, a court will consider the following factors:

* Income, assets, and liabilities of each spouse

* The duration of the marriage

* The age and health of both spouses

* Pension and retirement accounts

This list does not include each factor listed in North Carolina General Statute § 50-20. The judge will consider a wide range of issues before deciding on how to divide assets and debts between the parties.

## North Carolina Equitable Distribution Process

Remember that at least one spouse must request equitable distribution in a properly-filed claim prior to a final divorce. Beware that an equitable distribution claim pending by one spouse at the time of divorce may be  dismissed by this spouse after the divorce is final.  If this happens and the other spouse does not also have a properly filed claim pending for equitable distribution, this spouse will have lost the right to equitable distribution.  It is not enough for only one spouse to have  a properly-filed claim for equitable distribution prior to the divorce becoming final if the one spouse dismisses it after the divorce.
To initiate this process, a complaint must be drafted and filed with the court. This legal document should include the request for equitable distribution, as well as various other details, including both spouses'' names , designation of plaintiff and defendant, the date of marriage, and the date of separation. You or your attorney must sign this document before submitting it to the court but not as a verification which is sworn to in front of a notary.

Once that complaint is filed, the spouse that initiated the claim has 90 days to prepare an [equitable distribution inventory affidavit](https://www.ncleg.net/EnactedLegislation/Statutes/HTML/BySection/Chapter_50/GS_50-21.html) and serve the other party, although these deadlines vary from county to county. Thirty days later, the other spouse who was served must also complete an affidavit outlining the inventory of property for equitable distribution. It can be challenging to create an accurate inventory of years or decades of accumulated property, so courts are lenient with the contents of the initially-filed affidavit as long as a good faith effort was made to complete it. These affidavits can be amended.

Alternately, divorces that involve simple or few assets and debts may be better served using an [equitable distribution worksheet](https://www.nccourts.gov/assets/documents/local-rules-forms/881.pdf?IlZ9dvu5RI1DMX7CPAoMY6l_yQ4ohIvS) instead of an affidavit.

## Equitable Distribution Lawyer in North Carolina

Marital property division in North Carolina is a complex process that can be difficult to navigate, especially when emotions are running high. If you have questions about the North Carolina divorce property settlement process or how a court may handle your assets and debts in a North Carolina divorce, contact [North Carolina Legal Services](https://www.northcarolinalegalservices.org/contact).
',
  'Dividing property is one of the most significant issues a divorcing couple will need to deal with. When separated spouses cannot agree on how to divide their assets and debts in a divorce, they can request the court''s assistance through a process known as equitable distribution.', 'Legal Services', 'published',
  'user-ncls-blawby', NULL,
  '2026-01-02T12:00:00.000Z',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Dividing property is one of the most significant issues a divorcing couple will need to deal with. When separated spouses cannot agree on how to divide their assets and debts in a divorce, they can request the court''s assistance through a process known as equitable distribution.', 'North Carolina Divorce Process, Divorce Procedure in NC, How to File for Divorce in NC, NC Divorce Laws, Divorce Paperwork North Carolina, Divorce Legal Advice NC, NC Divorce Requirements, Separation in North Carolina, Family Law Attorney NC, Divorce Settlements in North Carolina, Child Custody in NC Divorce, NC Alimony Rules, Understanding Divorce in NC, North Carolina Divorce FAQ, DIY Divorce North Carolina, Equitable Distribution NC, North Carolina Legal Services',
  '/article/equitable-distribution-in-north-carolina-divorces', NULL
);
