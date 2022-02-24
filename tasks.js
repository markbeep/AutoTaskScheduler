const { writeFileSync } = require("fs");
const { google, tasks_v1 } = require("googleapis");
const { exit } = require("process");
let { dateFirstWeek, taskListName, format, schedule } = require("./schedule.json")
dateFirstWeek = new Date(dateFirstWeek);

const taskLogFileName = "taskLog.json";

let addedTasks;
try {
    addedTasks = require(`./${taskLogFileName}`);
} catch (e) {
    writeFileSync(taskLogFileName, "[]");
    addedTasks = [];
}

/**
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function handleTasks(auth) {
    let week = calculateWeek(dateFirstWeek);
    let tasksToAdd = checkSchedule(schedule, addedTasks, week);

    if (tasksToAdd.length > 0) {
        console.log(`There are ${tasksToAdd.length} tasks to add!`);
        const service = google.tasks({ version: 'v1', auth });
        let id = await getTaskListId(service, taskListName);
        for (let i = 0; i < tasksToAdd.length; i++) {
            console.log(`Adding new task: ${formatTask(format, tasksToAdd[i], week)}`)
            await addTask(tasksToAdd[i], addedTasks, service, id, format, week);
        }
    } else {
        console.log("There are no tasks to add.");
    }
}

/**
 * Gets the tasklist's ID
 * @param {tasks_v1.Tasks} service Tasks service
 * @param {string} taskListName The name of the taskList to maintain
 */
async function getTaskListId(service, taskListName) {
    const res = await service.tasklists.list();
    let taskList = res.data.items.find(e => e.title.toLowerCase() === taskListName.toLowerCase());
    if (!taskList) {
        console.error("No Task with the given name found");
        exit(1);
    }
    return taskList.id;
}

/**
 * Checks the schedule to see if there's any need to create a task
 * @param {{subject: string, type: string, weekday: string, time: number}[]} schedule
 * @param {{subject: string, type: string, weekday: string, time: number, week: number}[]} addedTasks 
 * @param {number} week
 */
function checkSchedule(schedule, addedTasks, week) {
    let tasksToAdd = [];
    for (let i = 0; i < schedule.length; i++) {
        let s = schedule[i];

        if (hasBeenCreated(s, addedTasks, week))
            continue;

        tasksToAdd.push(s);
    }
    return tasksToAdd;
}

/**
 * Checks if the task has already been created for this week and it's the right time to send
 * @param {{subject: string, type: string, weekday: string, time: number}} scheduleTask 
 * @param {{subject: string, type: string, weekday: string, time: number, week: number}[]} addedTasks 
 * @param {number} week 
 */
function hasBeenCreated(scheduleTask, addedTasks, week) {
    let today = new Date().getDay();
    let hour = new Date().getHours();
    let s = scheduleTask; // alias
    let day = dayToNumber(scheduleTask.weekday);

    // if the task is scheduled for a future day or future hour, return false
    if (day > today || (today === day && scheduleTask.time > hour)) return true;

    for (let i = 0; i < addedTasks.length; i++) {
        let a = addedTasks[i];
        if (s.subject === a.subject && s.type === a.type && s.weekday === a.weekday && s.time === a.time && week === a.week)
            return true;
    }
    return false;
}

/**
 * Turns a given day string into a number
 * @param {string} dayName 
 * @returns {number}
 */
function dayToNumber(dayName) {
    switch (dayName.toLowerCase()) {
        case "sunday": return 0;
        case "monday": return 1;
        case "tuesday": return 2;
        case "wednesday": return 3;
        case "thursday": return 4;
        case "friday": return 5;
        case "saturday": return 6;
    }
    console.error("Invalid day received in 'schedule.json'. It needs to be an English day and correctly spelled.")
    exit(1);
}

/**
 * 
 * @param {{subject: string, type: string, weekday: string, time: number}} scheduleTask 
 * @param {{subject: string, type: string, weekday: string, time: number, week: number}[]} addedTasks 
 * @param {tasks_v1.Tasks} service Tasks service
 * @param {number} taskListId Tasklist ID to add the task to
 * @param {string} format The format to post the task as
 * @param {number} week
 */
async function addTask(scheduleTask, addedTasks, service, taskListId, format, week) {
    let formatted = formatTask(format, scheduleTask, week);

    const res = await service.tasks.insert({
        tasklist: taskListId,

        requestBody: {
            title: formatted,
        }
    });

    addedTasks.push({ ...scheduleTask, week });
    writeFileSync(taskLogFileName, JSON.stringify(addedTasks));
}

/**
 * @param {Date} dateFirstWeek The date object of the first semester day to calculate the semester weeks
 * @returns {number}
 */
function calculateWeek(dateFirstWeek) {
    let diff = Math.abs(new Date() - dateFirstWeek);
    let weeksPassed = Math.floor(diff / 60.48e7);  // 60.48e7 is milliseconds / week
    return weeksPassed + 1;
}

/**
 * 
 * @param {string} format 
 * @param {{subject: string, type: string, weekday: string, time: number}} task 
 * @param {number} week 
 * @returns {string} Formatted string
 */
function formatTask(format, task, week) {
    return format.replaceAll("${subject}", task.subject).replaceAll("${type}", task.type).replaceAll("${week}", week);
}

module.exports = handleTasks;