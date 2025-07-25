#!/usr/bin/env node
/**
 * Generic script to extract guide outline and generate slide stubs from markdown files
 * 
 * Input Format Requirements:
 * - Guide file: Markdown with YAML frontmatter containing 'title:', H1 sections, H2 activities
 * - Slides content: Markdown with module headers (## Module X) and activity bullets (* activity 1, * task 1, etc.)
 * 
 * Customizable via PATTERNS object for different naming conventions
 * Usage: node generate-slides.js [input_guide] [input_slide_content] [output_guide_outline] [output_slides]
 */

const fs = require('fs');
const path = require('path');

// Default configuration
const DEFAULT_INPUT = {
    GUIDE: "merged.md",
    SLIDE_CONTENT: "slide-topics.md"
};
const DEFAULT_OUTPUT = {
    COURSE_OUTLINE: "output/course-outline.md",
    COURSE_OUTLINE_WITH_TOPICS: "output/course-outline-with-topics.md",
    COURSE_WEBSITE_TOPICS: "output/course-website-topics.md",
    COURSE_WEBSITE_AGENDA: "output/course-website-agenda.md",
    SLIDE_CONTENT: "output/slide-titles-and-initial-content.md"
};
const OUTPUT_DIR = "tools/content-generator";

const OUT_FMT = {
    COURSE_H: "#",
    MODULE_H: "##",
    BULLET_L1: "  -",
    BULLET_L2: "    -",
    BULLET_L3: "      -",
    OBJECTIVES_TEXT: "What You'll Learn in This Module"
};

// Configuration patterns - can be customized for different formats
// Modify these patterns to match your specific document structure
const PATTERNS = {
    // Input guide structure constants
    INPUT_GUIDE_MODULE_HEADER: /^# (.+)$/,         // H1 in inputGuide = module items
    INPUT_GUIDE_OBJECTIVES_HEADER: /^#### Objectives$/i,  // H4 "Objectives" in inputGuide = objectives list for parent module
    INPUT_GUIDE_ACTIVITY_HEADER: /^## (.+)$/,      // H2 in inputGuide = Activity items
    get INPUT_GUIDE_TASK_HEADER() {
        return this.TASK_HEADING_PATTERN;           // H4 task headers in inputGuide = tasks
    },
    
    // Input slide content structure constants
    INPUT_SLIDES_MODULE_HEADER: /^# (.+)$/,        // H1 in inputSlideContent = module items
    
    // Legacy patterns for backward compatibility
    MODULE_HEADER_IN_OUTLINE: /^## (.+): (.+)$/,  // Matches "## Module 1: Title" or "## Section A: Title"
    MODULE_HEADER_IN_SLIDES: /^## (.+)$/,         // Matches "## Module 1" or "## Section A"
    
    // Task patterns - flexible to match various formats
    TASK_PATTERNS: [
        /^\s*\*\s*task[\s\-\.]?(\d+)/i,           // "task 1", "task-1"
        /^\s*\*\s*exercise[\s\-\.]?(\d+)/i,       // "exercise 1"
        /^\s*\*\s*step[\s\-\.]?(\d+)/i            // "step 1"
    ],

    // Task heading patterns for markdown format - dynamically built from TASK_PATTERNS
    get TASK_HEADING_PATTERN() {
        // Simple approach - just match the known task types
        const taskTypesString = 'Task|Exercise|Step';
        return new RegExp(`^#### (${taskTypesString})(?:\\s+\\d+)?:?\\s*(.+)$`, 'i');
    },
    
    // Activity patterns - flexible to match various formats
    // Add or modify patterns to match your activity naming convention
    get ACTIVITY_PATTERNS() {
        return [
            /^\s*\*\s*activity[\s\-\.]?(\d+)/i,       // "activity 1", "activity-1", "activity.1"
            /^\s*\*\s*a[\s\-\.]?(\d+)/i,              // "a1", "a-1", "a.1"
            ...this.TASK_PATTERNS
        ];
    },
    
    // Activity extraction from outline (for numbered activities like "Activity 1-2:")
    ACTIVITY_NUMBER_EXTRACT: /(\d+)(?:-(\d+))?:/,
    
    // Indentation levels for content hierarchy - adjust based on your markdown style
    TOP_LEVEL_INDENT: 4,      // Spaces for top-level content bullets
    ACTIVITY_CHILD_INDENT: 6,  // Spaces for direct children of activities
    
    // Skip patterns for headings (can be customized per project)
    // Add terms that should be ignored when extracting headings
    SKIP_TITLE_PATTERNS: ['contents', 'copyright', 'navigation'],
    SKIP_HEADING_PATTERNS: [
        'references', 'c:/', 'lint the changes',
        'json files are compiled', 'make sure to update'
    ]
};

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);

    const inputGuide = args[0] || DEFAULT_INPUT.GUIDE;
    const inputSlideContent = args[1] || DEFAULT_INPUT.SLIDE_CONTENT;
    const outputSlides = args[2] || path.join(OUTPUT_DIR, DEFAULT_OUTPUT.SLIDE_CONTENT);
    const outputGuideOutline = args[3] || path.join(OUTPUT_DIR, DEFAULT_OUTPUT.COURSE_OUTLINE);
    const outputSlidesContentWithTitles = args[4] || path.join(OUTPUT_DIR, DEFAULT_OUTPUT.COURSE_OUTLINE_WITH_TOPICS);
    const outputCourseWebsiteTopics = args[5] || path.join(OUTPUT_DIR, DEFAULT_OUTPUT.COURSE_WEBSITE_TOPICS);
    const outputCourseWebsiteAgenda = args[6] || path.join(OUTPUT_DIR, DEFAULT_OUTPUT.COURSE_WEBSITE_AGENDA);
    
    return {
        inputGuide: inputGuide,
        inputSlideContent: inputSlideContent,
        outputGuideOutline: outputGuideOutline,
        outputSlides: outputSlides,
        outputCourseWebsiteTopics: outputCourseWebsiteTopics,
        outputCourseWebsiteAgenda: outputCourseWebsiteAgenda,
        outputSlidesContentWithTitles: outputSlidesContentWithTitles
    };
}

/**
 * Display usage information
 */
function showUsage() {
    console.log(`
Usage: node generate-slides.js [input_guide] [input_slide_content] [output_slides] [output_course_outline] [output_course_outline_with_titles] [output_course_website_topics] [output_course_website_agenda]

Parameters:
  input_guide                    Path to the guide markdown file (with YAML frontmatter and H1/H2 structure)
                                 Default: "${DEFAULT_INPUT.GUIDE}"
  
  input_slide_content            Path to the slides content file (with module headers and activity bullets)
                                 Default: "${DEFAULT_INPUT.SLIDE_CONTENT}"
  
  output_slides                  Path for the final slides output file
                                 Default: "${DEFAULT_OUTPUT.SLIDE_CONTENT}"
  
  output_course_outline           Path for the intermediate guide outline file
                                 Default: "${DEFAULT_OUTPUT.COURSE_OUTLINE}"
  
  output_course_outline_with_titles Path for slides content with proper titles filled in
                                 Default: "${DEFAULT_OUTPUT.COURSE_OUTLINE_WITH_TOPICS}"
  
  output_course_website_topics   Path for the course topics output file
                                 Default: "${DEFAULT_OUTPUT.COURSE_WEBSITE_TOPICS}"
  
  output_course_website_agenda   Path for the course agenda output file
                                 Default: "${DEFAULT_OUTPUT.COURSE_WEBSITE_AGENDA}"

Examples:
  node generate-slides.js
  node generate-slides.js "../merged/My Guide.md"
  node generate-slides.js "../merged/My Guide.md" "my-slides.md"
  node generate-slides.js "../merged/My Guide.md" "my-slides.md" "my-final-slides.md" "my-outline.md" "my-slides-with-titles.md" "my-topics.md" "my-agenda.md"
`);
}

/**
 * Extract H1 and H2 headings from a markdown file
 */
function extractHeadings(filePath) {
    const headings = [];
    let inCodeBlock = false;
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            const originalLine = line;
            const trimmedLine = line.trim();
            
            // Track code blocks to avoid capturing headings inside them
            if (trimmedLine.startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                return;
            }
            
            // Skip lines inside code blocks
            if (inCodeBlock) return;
            
            // Match H1 headings (# Title) - modules in input guide
            const h1Match = trimmedLine.match(PATTERNS.INPUT_GUIDE_MODULE_HEADER);
            if (h1Match) {
                const title = h1Match[1].trim();
                // Skip certain titles like front matter or TOC
                if (!PATTERNS.SKIP_TITLE_PATTERNS.some(skip => title.toLowerCase().includes(skip))) {
                    headings.push({
                        level: 1,
                        title: title,
                        line: index + 1
                    });
                }
            }
            
            // Match H2 headings (## Title) - activities in input guide
            const h2Match = trimmedLine.match(PATTERNS.INPUT_GUIDE_ACTIVITY_HEADER);
            if (h2Match && !originalLine.startsWith('   ') && !originalLine.startsWith('\t')) {
                const title = h2Match[1].trim();
                
                // Also skip if it looks like a code path or comment
                if (!PATTERNS.SKIP_HEADING_PATTERNS.some(skip => title.toLowerCase().includes(skip)) &&
                    !/^[A-Z]:[/\\]/.test(title) && // Windows paths
                    !title.startsWith('/') && // Unix paths
                    title.length > 3) { // Minimum meaningful length
                    headings.push({
                        level: 2,
                        title: title,
                        line: index + 1
                    });
                }
            }
        });
        
    } catch (error) {
        console.error(`Error reading file '${filePath}':`, error.message);
        return [];
    }
    
    return headings;
}

/**
 * Generate markdown outline from headings
 */
function generateOutline(headings, sourceFile) {
    const outline = [];
    let isFirstModule = true;
    
    // Extract H1 from the source file
    const h1Title = extractH1FromFile(sourceFile);
    outline.push(`${OUT_FMT.COURSE_H} ${h1Title}`);
    outline.push('');
    
    for (const heading of headings) {
        if (heading.level === 1) {
            // H1 becomes module header
            let moduleTitle = heading.title;
            // Clean up TODO markers and other formatting from module titles
            moduleTitle = moduleTitle.replace(/\s+TODO.*$/, '');
            moduleTitle = moduleTitle.replace(/\s+\(.*\)$/, '');
            
            // Add line break before module title (except for the first one)
            if (!isFirstModule) {
                outline.push('');
            }
            isFirstModule = false;
            
            outline.push(`${OUT_FMT.MODULE_H} ${moduleTitle}`);
            
        } else if (heading.level === 2) {
            // H2 becomes activity bullet point
            let title = heading.title;
            // Clean up TODO markers and other formatting
            title = title.replace(/\s+TODO.*$/, '');
            title = title.replace(/\s+\(.*\)$/, '');
            outline.push(`- ${title}`);
        }
    }
    
    return outline.join('\n');
}

/**
 * Parse the outline file and extract modules and activities
 */
function parseOutline(outlineFile) {
    const modules = {};
    let currentModule = null;
    
    try {
        const content = fs.readFileSync(outlineFile, 'utf8');
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Match module headers (## Module X: Title or ## Section A: Title)
            const moduleMatch = trimmedLine.match(PATTERNS.MODULE_HEADER_IN_OUTLINE);
            if (moduleMatch) {
                const moduleNum = moduleMatch[1];
                const moduleTitle = moduleMatch[2];
                currentModule = moduleNum;
                modules[currentModule] = {
                    title: moduleTitle,
                    activities: []
                };
            }
            
            // Match activity bullets (- Activity X-Y: Title)
            else if (trimmedLine.startsWith('- ') && currentModule) {
                const activity = trimmedLine.substring(2); // Remove "- "
                modules[currentModule].activities.push(activity);
            }
        }
        
    } catch (error) {
        console.error(`Error reading outline file '${outlineFile}':`, error.message);
        return {};
    }
    
    return modules;
}

/**
 * Parse the slides content file and extract content for each module and activity
 */
function parseSlidesContent(slidesFile) {
    const slidesContent = {};
    let currentModule = null;
    let currentActivity = null;
    let contentLines = [];
    
    try {
        const content = fs.readFileSync(slidesFile, 'utf8');
        const lines = content.split('\n');
        
        for (const line of lines) {
            const originalLine = line;
            const trimmedLine = line.trim();
            
            // Match module headers (# Module X or # Section A) in slide content
            const moduleMatch = trimmedLine.match(PATTERNS.INPUT_SLIDES_MODULE_HEADER);
            if (moduleMatch) {
                // Save previous content if any
                if (currentModule && contentLines.length > 0) {
                    if (currentActivity) {
                        slidesContent[currentModule].activities[currentActivity] = [...contentLines];
                    } else {
                        slidesContent[currentModule].content = [...contentLines];
                    }
                }
                
                currentModule = moduleMatch[1];
                currentActivity = null;
                contentLines = [];
                
                if (!slidesContent[currentModule]) {
                    slidesContent[currentModule] = {
                        content: [],
                        activities: {}
                    };
                }
            }
            
            // Match activity patterns (activity 1, A1, task 1, etc.)
            else if (currentModule) {
                let activityMatch = null;
                let activityNum = null;
                
                // Try each activity pattern until we find a match
                for (const pattern of PATTERNS.ACTIVITY_PATTERNS) {
                    activityMatch = trimmedLine.match(pattern);
                    if (activityMatch) {
                        activityNum = activityMatch[1]; // The captured number
                        break;
                    }
                }
                
                if (activityMatch && activityNum) {
                    // Save previous activity content if any
                    if (currentActivity && contentLines.length > 0) {
                        slidesContent[currentModule].activities[currentActivity] = [...contentLines];
                    }
                    // If no current activity, save to module content
                    else if (!currentActivity && contentLines.length > 0) {
                        slidesContent[currentModule].content = [...contentLines];
                    }
                    
                    currentActivity = activityNum;
                    contentLines = [];
                }
                
                // Collect content lines (everything else)
                else if (trimmedLine && !trimmedLine.startsWith('Using that same logic')) {
                    contentLines.push(originalLine.trimEnd());
                }
            }
        }
        
        // Save final content
        if (currentModule && contentLines.length > 0) {
            if (currentActivity) {
                slidesContent[currentModule].activities[currentActivity] = [...contentLines];
            } else {
                slidesContent[currentModule].content = [...contentLines];
            }
        }
        
    } catch (error) {
        console.error(`Error reading slides content file '${slidesFile}':`, error.message);
        return {};
    }
    
    return slidesContent;
}

/**
 * Extract objectives from a module in the input guide
 */
function extractModuleObjectives(inputGuideFile, moduleTitle) {
    const objectives = [];
    
    try {
        const content = fs.readFileSync(inputGuideFile, 'utf8');
        const lines = content.split('\n');
        
        let foundModule = false;
        let foundObjectives = false;
        let inCodeBlock = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // Track code blocks
            if (trimmedLine.startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                continue;
            }
            
            // Skip lines inside code blocks
            if (inCodeBlock) continue;
            
            // Look for the module heading (H1)
            if (!foundModule) {
                const h1Match = trimmedLine.match(PATTERNS.INPUT_GUIDE_MODULE_HEADER);
                if (h1Match) {
                    // Clean up the matched title by removing TODO and other suffixes
                    let matchedTitle = h1Match[1].trim();
                    // Remove TODO and everything after it
                    matchedTitle = matchedTitle.replace(/\s+TODO.*$/, '');
                    // Remove parenthetical content
                    matchedTitle = matchedTitle.replace(/\s+\(.*\)$/, '');
                    // Extract just the title part after "Module X: "
                    const moduleMatch = matchedTitle.match(/^Module\s+\d+:\s*(.+)$/);
                    if (moduleMatch) {
                        const extractedTitle = moduleMatch[1].trim();
                        if (extractedTitle === moduleTitle) {
                            foundModule = true;
                        }
                    }
                }
                continue;
            }
            
            // Stop if we hit another H1 module
            if (foundModule && trimmedLine.match(PATTERNS.INPUT_GUIDE_MODULE_HEADER)) {
                break;
            }
            
            // Look for objectives header
            if (foundModule && !foundObjectives) {
                if (trimmedLine.match(PATTERNS.INPUT_GUIDE_OBJECTIVES_HEADER)) {
                    foundObjectives = true;
                }
                continue;
            }
            
            // Extract bullet points after objectives header
            if (foundObjectives) {
                // Stop if we hit another heading
                if (trimmedLine.match(/^#{1,6}\s/)) {
                    break;
                }
                
                // Extract bullet points
                if (trimmedLine.match(/^[\*\-\+]\s/)) {
                    const objectiveText = trimmedLine.replace(/^[\*\-\+]\s/, '').trim();
                    if (objectiveText) {
                        objectives.push(objectiveText);
                    }
                }
                
                // Continue processing - don't stop on empty lines unless we've collected
                // objectives and hit two consecutive empty lines or another major section
            }
        }
        
    } catch (error) {
        console.error(`Error reading input guide for module objectives '${moduleTitle}':`, error.message);
    }
    
    return objectives;
}

/**
 * Extract only plain paragraph text following an activity heading in the input guide,
 * plus any Task/Step/Exercise titles as child bullets
 */
function extractActivityScenario(inputGuideFile, activityTitle) {
    const result = {
        scenario: [],
        tasks: []
    };
    
    try {
        const content = fs.readFileSync(inputGuideFile, 'utf8');
        const lines = content.split('\n');
        
        let foundActivity = false;
        let inCodeBlock = false;
        let collectingTasks = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // Track code blocks
            if (trimmedLine.startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                continue;
            }
            
            // Skip lines inside code blocks
            if (inCodeBlock) continue;
            
            // Look for the activity heading
            if (!foundActivity) {
                const h2Match = trimmedLine.match(PATTERNS.INPUT_GUIDE_ACTIVITY_HEADER);
                if (h2Match) {
                    // Clean up the matched title by removing TODO and other suffixes
                    const matchedTitle = h2Match[1].trim().replace(/\s+TODO\s*$/, '');
                    if (matchedTitle === activityTitle) {
                        foundActivity = true;
                    }
                }
                continue;
            }
            
            // Stop if we hit another ## Activity
            if (trimmedLine.match(PATTERNS.INPUT_GUIDE_ACTIVITY_HEADER)) {
                break;
            }
            
            // Skip empty lines after finding the activity
            if (foundActivity && trimmedLine.match(/^\s*$/)) {
                continue;
            }
            
            // Check for Task/Step/Exercise headings using the configured patterns
            const taskMatch = trimmedLine.match(PATTERNS.INPUT_GUIDE_TASK_HEADER);
            if (taskMatch) {
                collectingTasks = true;
                const taskTitle = taskMatch[2].trim();
                result.tasks.push(taskTitle);
                continue;
            }
            
            // Also check if this line matches any of the task patterns from slides content
            // This allows for consistency between slide content parsing and activity scenario extraction
            let isTaskFromPattern = false;
            for (const pattern of PATTERNS.TASK_PATTERNS) {
                if (pattern.test(trimmedLine)) {
                    isTaskFromPattern = true;
                    break;
                }
            }
            
            if (isTaskFromPattern) {
                collectingTasks = true;
                // Extract the task title by removing the pattern prefix
                let taskTitle = trimmedLine.replace(/^\s*\*\s*/, '').replace(/^(task|exercise|step)[\s\-\.]?\d*:?\s*/i, '').trim();
                if (taskTitle) {
                    result.tasks.push(taskTitle);
                }
                continue;
            }
            
            // If we're not collecting tasks yet, look for the first paragraph text
            if (!collectingTasks) {
                // Stop conditions for paragraph collection: any formatted content
                if (
                    trimmedLine.match(/^#{3,6}\s/) ||          // h3, h4, h5, h6 headings
                    trimmedLine.match(/^\d+\./) ||             // Ordered list
                    trimmedLine.match(/^[\*\-\+]\s/) ||        // Unordered list
                    trimmedLine.includes('**') ||              // Bold text
                    trimmedLine.includes('```') ||             // Code blocks
                    trimmedLine.match(/^\s*\|/) ||             // Tables (start with |)
                    trimmedLine.match(/^\s*>/) ||              // Blockquotes (start with >)
                    trimmedLine.match(/^\s*\[/) ||             // Links at start of line
                    trimmedLine.match(/^\s*<!--/)              // HTML comments
                ) {
                    collectingTasks = true; // Switch to task collection mode
                    continue;
                }
                
                // Look for the first substantial paragraph text after the activity title
                // This should be the scenario description
                if (trimmedLine && 
                    !trimmedLine.match(/^[^\w\s]/) &&          // Doesn't start with special characters
                    trimmedLine.length > 10) {                 // Minimum length for meaningful content
                    result.scenario.push(trimmedLine);
                    collectingTasks = true; // After finding the first paragraph, switch to task collection
                }
            }
        }
        
    } catch (error) {
        console.error(`Error reading input guide for activity scenario '${activityTitle}':`, error.message);
    }
    
    return result;
}

/**
 * Process slide content hierarchy according to the flattening rules
 */
function processSlideContentHierarchy(contentLines) {
    const processed = [];
    const stack = []; // Track parent hierarchy
    
    for (let i = 0; i < contentLines.length; i++) {
        const line = contentLines[i];
        const strippedLine = line.trimStart();
        
        if (!strippedLine.startsWith('*')) {
            if (line.trim()) {
                processed.push(line);
            }
            continue;
        }
        
        // Count leading spaces to determine indentation level
        const leadingSpaces = line.length - strippedLine.length;
        const indentLevel = Math.floor(leadingSpaces / 2); // Assuming 2 spaces per indent level
        const bulletContent = strippedLine.substring(1).trimStart(); // Remove * and any following spaces
        
        // Check if this is an activity bullet
        const isActivityBullet = PATTERNS.ACTIVITY_PATTERNS.some(pattern => pattern.test(bulletContent));
        
        // Update stack to current level
        stack.length = indentLevel;
        stack[indentLevel - 1] = { content: bulletContent, isActivity: isActivityBullet };
        
        if (indentLevel === 2) { // Level 1 bullets in slides content (4 spaces)
            if (isActivityBullet) {
                // Level 1 activity bullets: skip this, promote children to level 1
                continue;
            } else {
                // Level 1 non-activity bullets: keep as level 1, preserve children
                processed.push(`${OUT_FMT.BULLET_L1} ${bulletContent}`);
            }
        } else if (indentLevel === 3) { // Level 2 bullets in slides content (6 spaces)
            // Check if parent was a level 1 activity bullet
            const parentIsActivity = stack[1] && stack[1].isActivity;
            if (parentIsActivity) {
                // Promote to level 1 since parent activity was skipped
                processed.push(`${OUT_FMT.BULLET_L1} ${bulletContent}`);
            } else {
                // Keep as level 2 child
                processed.push(`${OUT_FMT.BULLET_L2} ${bulletContent}`);
            }
        } else {
            // Deeper levels: maintain relative hierarchy, but adjust if ancestors were promoted
            const parentIsActivity = stack[1] && stack[1].isActivity;
            let adjustedIndent = indentLevel;
            if (parentIsActivity) {
                // Reduce indent by 1 level since the activity parent was skipped
                adjustedIndent = indentLevel - 1;
            }
            
            const indent = '  '.repeat(adjustedIndent);
            processed.push(`${indent}- ${bulletContent}`);
        }
    }
    
    return processed;
}

/**
 * Merge the outline with slides content
 */
function mergeContent(modules, slidesContent, inputGuideFile) {
    const merged = [];
    
    // Extract H1 from the input guide file
    const h1Title = extractH1FromFile(inputGuideFile);
    merged.push(`${OUT_FMT.COURSE_H} ${h1Title}`);
    merged.push("");
    
    for (const [moduleKey, moduleData] of Object.entries(modules)) {
        // Add module header
        merged.push(`${OUT_FMT.MODULE_H} ${moduleKey}: ${moduleData.title}`);
        
        // Extract and add objectives as the first bullet under the module
        const objectives = extractModuleObjectives(inputGuideFile, moduleData.title);
        if (objectives.length > 0) {
            merged.push(`${OUT_FMT.BULLET_L1} ${OUT_FMT.OBJECTIVES_TEXT}`);
            for (const objective of objectives) {
                merged.push(`${OUT_FMT.BULLET_L2} ${objective}`);
            }
        }
        
        // Add module-level slides content if available
        if (slidesContent[moduleKey] && slidesContent[moduleKey].content) {
            const processedContent = processSlideContentHierarchy(slidesContent[moduleKey].content);
            for (const contentLine of processedContent) {
                merged.push(contentLine);
            }
        }
        
        // Process activities
        for (const activity of moduleData.activities) {
            // Extract activity number from the activity string
            const activityMatch = activity.match(PATTERNS.ACTIVITY_NUMBER_EXTRACT);
            let activityNum = null;
            if (activityMatch) {
                activityNum = activityMatch[2] || activityMatch[1]; // Use second number if available, otherwise first
            }
            
            // Add slides content for this activity if available (BEFORE the activity)
            if (activityNum && slidesContent[moduleKey] && 
                slidesContent[moduleKey].activities[activityNum]) {
                const processedActivityContent = processSlideContentHierarchy(slidesContent[moduleKey].activities[activityNum]);
                for (const contentLine of processedActivityContent) {
                    merged.push(contentLine);
                }
            }
            
            // Add the activity at the same level as topics
            merged.push(`${OUT_FMT.BULLET_L1} ${activity}`);
            
            // Extract and add activity scenario from input guide
            const activityData = extractActivityScenario(inputGuideFile, activity);
            
            // Add scenario paragraphs as child bullets of the activity
            if (activityData.scenario.length > 0) {
                for (const paragraph of activityData.scenario) {
                    if (paragraph.trim()) {
                        merged.push(`${OUT_FMT.BULLET_L2} ${paragraph}`);
                        
                        // Add tasks as child bullets of the scenario
                        if (activityData.tasks.length > 0) {
                            for (const task of activityData.tasks) {
                                merged.push(`${OUT_FMT.BULLET_L3} ${task}`);
                            }
                        }
                    }
                }
            } else if (activityData.tasks.length > 0) {
                // If no scenario but we have tasks, add them directly under the activity
                for (const task of activityData.tasks) {
                    merged.push(`${OUT_FMT.BULLET_L2} ${task}`);
                }
            }
        }
        
        merged.push(""); // Add blank line after each module
    }
    
    // Count L1 bullets (which represent slides)
    const l1BulletCount = merged.filter(line => line.startsWith(OUT_FMT.BULLET_L1)).length;
    
    // Insert the slide count statement after the H1 title
    merged.splice(2, 0, `Approximately ${l1BulletCount} slides will be created for the required activities and associated content topics.`);
    merged.splice(3, 0, ""); // Add blank line after the statement
    
    return merged.join('\n');
}

/**
 * Generate course topics from top-level bullets and activity sub-bullets in slides content
 */
function generateCourseTopics(slidesContent, outlineFile, inputGuideFile) {
    const topics = [];
    
    // Extract H1 from the input guide file
    const h1Title = extractH1FromFile(inputGuideFile);
    topics.push(`${OUT_FMT.COURSE_H} ${h1Title}`);
    topics.push("");
    
    // Parse the outline file to get module titles
    const outlineData = parseOutlineForTopics(outlineFile);
    
    // Helper function to extract level 1 bullets only (with hierarchy processing)
    function extractLevel1Bullets(contentLines) {
        const level1Bullets = [];
        const stack = []; // Track parent hierarchy
        
        for (let i = 0; i < contentLines.length; i++) {
            const line = contentLines[i];
            const strippedLine = line.trimStart();
            
            if (!strippedLine.startsWith('*')) {
                continue;
            }
            
            // Count leading spaces to determine indentation level
            const leadingSpaces = line.length - strippedLine.length;
            const indentLevel = Math.floor(leadingSpaces / 2); // Assuming 2 spaces per indent level
            const bulletContent = strippedLine.substring(1).trimStart(); // Remove * and any following spaces
            
            // Check if this is an activity bullet
            const isActivityBullet = PATTERNS.ACTIVITY_PATTERNS.some(pattern => pattern.test(bulletContent));
            
            // Update stack to current level
            stack.length = indentLevel;
            stack[indentLevel - 1] = { content: bulletContent, isActivity: isActivityBullet };
            
            if (indentLevel === 2) { // Level 1 bullets in slides content (4 spaces)
                if (!isActivityBullet) {
                    // Level 1 non-activity bullets: include as level 1 topic
                    level1Bullets.push(`- ${bulletContent}`);
                }
                // Level 1 activity bullets: skip (their children will be promoted)
            } else if (indentLevel === 3) { // Level 2 bullets in slides content (6 spaces)
                // Check if parent was a level 1 activity bullet
                const parentIsActivity = stack[1] && stack[1].isActivity;
                if (parentIsActivity) {
                    // Promote to level 1 since parent activity was skipped
                    level1Bullets.push(`- ${bulletContent}`);
                }
                // Level 2 bullets under non-activities: skip (we only want level 1)
            }
            // Deeper levels: skip (we only want level 1 bullets)
        }
        
        return level1Bullets;
    }
    
    // Add module content with proper titles
    for (const [moduleKey, moduleData] of Object.entries(slidesContent)) {
        // Get the proper module title from outline
        const moduleTitle = outlineData.moduleMap[moduleKey] || moduleKey;
        topics.push(`${OUT_FMT.MODULE_H} ${moduleTitle}`);
        
        // Add module-level content (level 1 bullets only)
        if (moduleData.content && moduleData.content.length > 0) {
            const level1Bullets = extractLevel1Bullets(moduleData.content);
            for (const bullet of level1Bullets) {
                topics.push(bullet);
            }
        }
        
        // Add activity-level content (level 1 bullets only)
        if (moduleData.activities) {
            for (const [activityNum, activityContent] of Object.entries(moduleData.activities)) {
                const level1Bullets = extractLevel1Bullets(activityContent);
                for (const bullet of level1Bullets) {
                    topics.push(bullet);
                }
            }
        }
        
        topics.push(""); // Add blank line after each module
    }
    
    return topics.join('\n');
}

/**
 * Generate course website agenda from module titles
 */
function generateCourseWebsiteAgenda(outlineFile, inputGuideFile) {
    const agenda = [];
    
    // Extract H1 from the input guide file
    const h1Title = extractH1FromFile(inputGuideFile);
    agenda.push(`${OUT_FMT.COURSE_H} ${h1Title}`);
    agenda.push("");
    agenda.push(`${OUT_FMT.MODULE_H} Agenda`);
    
    // Parse the outline file to get module titles
    const outlineData = parseOutlineForTopics(outlineFile);
    
    // Add module titles (without "Module #:" prefix)
    for (const [moduleKey, moduleTitle] of Object.entries(outlineData.moduleMap)) {
        agenda.push(`- ${moduleTitle}`);
    }
    
    return agenda.join('\n');
}

/**
 * Generate slides content with proper module and activity titles filled in
 */
function generateSlidesContentWithTitles(slidesContentFile, outlineFile, inputGuideFile) {
    const output = [];
    
    // Extract H1 from the input guide file
    const h1Title = extractH1FromFile(inputGuideFile);
    output.push(`${OUT_FMT.COURSE_H} ${h1Title}`);
    output.push("");
    
    // Parse the outline file to get ALL module titles and activities
    const modules = parseOutline(outlineFile);
    
    // Parse the slides content to get the content for each module
    const slidesContent = parseSlidesContent(slidesContentFile);
    
    // Add any instructional text from the beginning of slides content
    try {
        const content = fs.readFileSync(slidesContentFile, 'utf8');
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
                         // Add instructional text until we hit the first module
             if (trimmedLine.startsWith('Using that same logic') || 
                 (trimmedLine && !PATTERNS.INPUT_SLIDES_MODULE_HEADER.test(trimmedLine) && 
                  !output.some(l => PATTERNS.INPUT_SLIDES_MODULE_HEADER.test(l.trim())))) {
                 output.push(line);
             } else if (PATTERNS.INPUT_SLIDES_MODULE_HEADER.test(trimmedLine)) {
                 break; // Stop when we hit the first module
             }
        }
        
    } catch (error) {
        console.error(`Error reading slides content file '${slidesContentFile}':`, error.message);
    }
    
    // Process ALL modules from the outline
    for (const [moduleKey, moduleData] of Object.entries(modules)) {
        output.push(`${OUT_FMT.MODULE_H} ${moduleKey}: ${moduleData.title}`);
        output.push("");
        
        // Add module-level content if available in slides content
        if (slidesContent[moduleKey] && slidesContent[moduleKey].content) {
            for (const contentLine of slidesContent[moduleKey].content) {
                // Replace * bullets with - bullets
                const formattedLine = contentLine.replace(/^(\s*)(\*)/g, '$1-');
                output.push(formattedLine);
            }
        }
        
        // Add all activities for this module
        for (let i = 0; i < moduleData.activities.length; i++) {
            const activity = moduleData.activities[i];
            output.push(`${OUT_FMT.BULLET_L1} ${activity}`);
            
            // Add activity-specific content if available in slides content
            const activityNum = String(i + 1); // Activities are 1-indexed
            if (slidesContent[moduleKey] && 
                slidesContent[moduleKey].activities[activityNum]) {
                for (const contentLine of slidesContent[moduleKey].activities[activityNum]) {
                    // Replace * bullets with - bullets
                    const formattedLine = contentLine.replace(/^(\s*)(\*)/g, '$1-');
                    output.push(formattedLine);
                }
            }
        }
        
        output.push(""); // Add blank line after each module
    }
    
    return output.join('\n');
}

/**
 * Extract the title from YAML frontmatter in a file
 */
function extractH1FromFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        let inFrontmatter = false;
        let frontmatterStarted = false;
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Check for YAML frontmatter delimiters
            if (trimmedLine === '---') {
                if (!frontmatterStarted) {
                    inFrontmatter = true;
                    frontmatterStarted = true;
                } else {
                    // End of frontmatter
                    break;
                }
                continue;
            }
            
            // If we're in frontmatter, look for title
            if (inFrontmatter) {
                const titleMatch = trimmedLine.match(/^title:\s*(.+)$/);
                if (titleMatch) {
                    // Remove quotes if present
                    let title = titleMatch[1].trim();
                    if ((title.startsWith('"') && title.endsWith('"')) || 
                        (title.startsWith("'") && title.endsWith("'"))) {
                        title = title.slice(1, -1);
                    }
                    return title;
                }
            }
        }
        
    } catch (error) {
        console.error(`Error reading file for title extraction '${filePath}':`, error.message);
    }
    
    // Fallback to filename if no title found
    return path.basename(filePath, path.extname(filePath));
}

/**
 * Parse the outline file to extract module titles
 */
function parseOutlineForTopics(outlineFile) {
    const moduleMap = {};
    
    try {
        const content = fs.readFileSync(outlineFile, 'utf8');
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Match module headers (## Module X: Title) - using legacy pattern for backward compatibility
            const moduleMatch = trimmedLine.match(PATTERNS.MODULE_HEADER_IN_OUTLINE);
            if (moduleMatch) {
                const moduleKey = moduleMatch[1];
                const moduleTitle = moduleMatch[2];
                moduleMap[moduleKey] = moduleTitle;
            }
        }
        
    } catch (error) {
        console.error(`Error reading outline file for topics '${outlineFile}':`, error.message);
    }
    
    return { moduleMap };
}

/**
 * Main function
 */
function main() {
    // Check for help flag
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        showUsage();
        return;
    }
    
    // Parse command line arguments
    const config = parseArgs();
    
    // Create output directory if it doesn't exist
    const outputDir = path.dirname(config.outputGuideOutline);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`Created output directory: ${outputDir}`);
    }
    
    console.log('Starting slide generation process...');
    console.log(`Configuration:
  Input Guide: ${config.inputGuide}
  Input Slide Content: ${config.inputSlideContent}
  Output Guide Outline: ${config.outputGuideOutline}
  Output Slides: ${config.outputSlides}
  Output Course Topics: ${config.outputCourseWebsiteTopics}
  Output Course Agenda: ${config.outputCourseWebsiteAgenda}
  Output Slides with Titles: ${config.outputSlidesContentWithTitles}
`);
    
    // Step 1: Extract headings from the guide
    console.log(`Extracting headings from: ${config.inputGuide}`);
    if (!fs.existsSync(config.inputGuide)) {
        console.error(`Error: Input guide file '${config.inputGuide}' does not exist.`);
        console.log('\nRun with --help for usage information.');
        process.exit(1);
    }
    
    const headings = extractHeadings(config.inputGuide);
    if (headings.length === 0) {
        console.error('No headings found or error reading file.');
        process.exit(1);
    }
    
    // Step 2: Generate outline
    console.log(`Generating outline: ${config.outputGuideOutline}`);
    const outlineContent = generateOutline(headings, config.inputGuide);
    
    try {
        fs.writeFileSync(config.outputGuideOutline, outlineContent, 'utf8');
        const moduleCount = headings.filter(h => h.level === 1).length;
        const activityCount = headings.filter(h => h.level === 2).length;
        console.log(`✓ Outline generated successfully: ${config.outputGuideOutline}`);
        console.log(`  Found ${moduleCount} modules and ${activityCount} activities`);
    } catch (error) {
        console.error(`Error writing outline file: ${error.message}`);
        process.exit(1);
    }
    
    // Step 3: Parse the generated outline
    console.log(`Parsing outline: ${config.outputGuideOutline}`);
    const modules = parseOutline(config.outputGuideOutline);
    
    // Step 4: Parse slides content
    console.log(`Parsing slides content: ${config.inputSlideContent}`);
    if (!fs.existsSync(config.inputSlideContent)) {
        console.error(`Error: Slides content file '${config.inputSlideContent}' does not exist.`);
        console.log('\nRun with --help for usage information.');
        process.exit(1);
    }
    
    const slidesContent = parseSlidesContent(config.inputSlideContent);
    
    if (Object.keys(modules).length === 0) {
        console.error('No modules found in outline file.');
        process.exit(1);
    }
    
    // Step 5: Merge content
    console.log(`Generating final slides: ${config.outputSlides}`);
    const mergedContent = mergeContent(modules, slidesContent, config.inputGuide);
    
    // Step 6: Write final output
    try {
        fs.writeFileSync(config.outputSlides, mergedContent, 'utf8');
        console.log(`✓ Slides generated successfully: ${config.outputSlides}`);
        console.log(`  Processed ${Object.keys(modules).length} modules with slides content`);
    } catch (error) {
        console.error(`Error writing slides file: ${error.message}`);
        process.exit(1);
    }
    
    // Step 7: Generate course topics
    console.log(`Generating course topics: ${config.outputCourseWebsiteTopics}`);
    const courseTopicsContent = generateCourseTopics(slidesContent, config.outputGuideOutline, config.inputGuide);
    try {
        fs.writeFileSync(config.outputCourseWebsiteTopics, courseTopicsContent, 'utf8');
        console.log(`✓ Course topics generated successfully: ${config.outputCourseWebsiteTopics}`);
        console.log(`  Processed ${Object.keys(slidesContent).length} modules for topics`);
    } catch (error) {
        console.error(`Error writing course topics file: ${error.message}`);
        process.exit(1);
    }
    
    // Step 8: Generate course website agenda
    console.log(`Generating course website agenda: ${config.outputCourseWebsiteAgenda}`);
    const courseAgendaContent = generateCourseWebsiteAgenda(config.outputGuideOutline, config.inputGuide);
    try {
        fs.writeFileSync(config.outputCourseWebsiteAgenda, courseAgendaContent, 'utf8');
        console.log(`✓ Course website agenda generated successfully: ${config.outputCourseWebsiteAgenda}`);
        const moduleCount = Object.keys(parseOutlineForTopics(config.outputGuideOutline).moduleMap).length;
        console.log(`  Processed ${moduleCount} modules for agenda`);
    } catch (error) {
        console.error(`Error writing course website agenda file: ${error.message}`);
        process.exit(1);
    }
    
    // Step 9: Generate slides content with proper titles
    console.log(`Generating slides content with titles: ${config.outputSlidesContentWithTitles}`);
    const slidesWithTitlesContent = generateSlidesContentWithTitles(config.inputSlideContent, config.outputGuideOutline, config.inputGuide);
    try {
        fs.writeFileSync(config.outputSlidesContentWithTitles, slidesWithTitlesContent, 'utf8');
        console.log(`✓ Slides content with titles generated successfully: ${config.outputSlidesContentWithTitles}`);
        console.log(`  Filled in module and activity titles from guide outline`);
    } catch (error) {
        console.error(`Error writing slides content with titles file: ${error.message}`);
        process.exit(1);
    }
    
    console.log('\nSlide generation complete! 🎉');
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = {
    extractHeadings,
    generateOutline,
    parseOutline,
    parseSlidesContent,
    mergeContent,
    generateCourseTopics
};
