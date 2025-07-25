# Content Generator

This script extracts a course outline and generates slide stubs from markdown files, designed for course development.

## Features

- Extracts course/module/activity structure from a guide markdown file.
- Merges slide content and guide outline to produce slide-ready markdown.
- Generates course topics and agenda for websites.
- Supports custom naming conventions via configuration.

## Input Format Requirements

- **Guide file**: Markdown with YAML frontmatter containing `title:`, H1 sections for modules, and H2 sections for activities.
- **Slides content**: Markdown with module headers (`# Module X`) and activity bullets (`* activity 1`, `* task 1`, etc.).

## Usage

```sh
node generator.js [input_guide] [input_slide_content] [output_slides] [output_course_outline] [output_course_outline_with_titles] [output_course_website_topics] [output_course_website_agenda]
```

### Parameters

- `input_guide`: Path to the guide markdown file (default: `merged.md`)
- `input_slide_content`: Path to the slides content file (default: `slide-topics.md`)
- `output_slides`: Path for the final slides output file (default: `output/slide-titles-and-initial-content.md`)
- `output_course_outline`: Path for the intermediate guide outline file (default: `output/course-outline.md`)
- `output_course_outline_with_titles`: Path for slides content with proper titles filled in (default: `output/course-outline-with-topics.md`)
- `output_course_website_topics`: Path for the course topics output file (default: `output/course-website-topics.md`)
- `output_course_website_agenda`: Path for the course agenda output file (default: `output/course-website-agenda.md`)

### Examples

```sh
node generator.js
node generator.js "../merged/My Guide.md"
node generator.js "../merged/My Guide.md" "my-slides.md"
node generator.js "../merged/My Guide.md" "my-slides.md" "my-final-slides.md" "my-outline.md" "my-slides-with-titles.md" "my-topics.md" "my-agenda.md"
```

## Output Files

- **Slides**: Markdown file with merged outline and slide content.
- **Course Outline**: Markdown outline of modules and activities.
- **Course Topics**: List of topics for website display.
- **Course Agenda**: List of modules for website agenda.
- **Slides with Titles**: Slide content with module and activity titles filled in.

## Customization

You can adjust naming conventions and parsing rules in the `PATTERNS` object inside [`generator.js`](content-generator/generator.js).

## License

See repository root for license information.