/**
 * Module for handing cloud automations.
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const fspromises = require("fs").promises;
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

exports.addAutomation = async function(consoleHandlers, name, module, form, icon) {
    try {
        const automationsForm = JSON.parse(await fspromises.readFile(`${KLOUD_CONSTANTS.FRONTENDROOTDIR}/commands/forms/automations.form.json`, "utf8"));
        const automationLabelName = "Automations"+name.replaceAll(" ", "");
        const automationFileName = "automations_"+name.replaceAll(" ", "").toLowerCase();
        if (automationsForm.i18n.en[automationLabelName]) {
            const err = `Error adding automation ${name}. Automation already exists, revise name.`; consoleHandlers.LOGERROR(err);
            return {...CMD_CONSTANTS.FALSE_RESULT(), out: "", err, stdout: "", stderr: err};
        }

        await fspromises.writeFile(`${KLOUD_CONSTANTS.FRONTENDROOTDIR}/commands/automations/${automationFileName}.mjs`, module, "utf8");
        await fspromises.writeFile(`${KLOUD_CONSTANTS.FRONTENDROOTDIR}/commands/forms/${automationFileName}.form.json`, form, "utf8");
        await fspromises.writeFile(`${KLOUD_CONSTANTS.FRONTENDROOTDIR}/img/${automationFileName}.svg`, icon, "utf8");
        
        automationsForm.rolelist["!user"].push({"id": `${automationFileName}`, "label": `{{{i18n.${automationLabelName}}}}`, "logo": `img/${automationFileName}.svg`, name});
        automationsForm.i18n.en[automationLabelName] = name; automationsForm.i18n.hi[automationLabelName] = name; 
        automationsForm.i18n.ja[automationLabelName] = name; automationsForm.i18n.zh[automationLabelName] = name; 
        await fspromises.writeFile(`${KLOUD_CONSTANTS.FRONTENDROOTDIR}/commands/forms/automations.form.json`, JSON.stringify(automationsForm, null, 4), "utf8");

        const out = `Automation ${name} added.`;
        return {...CMD_CONSTANTS.TRUE_RESULT(), out, err: "", stdout: out, stderr: ""};
    } catch (err) {
        const error = `Error adding automation ${name}. Error is: ${err}.`; consoleHandlers.LOGERROR(error);
        return {...CMD_CONSTANTS.FALSE_RESULT(), out: "", err: error, stdout: "", stderr: error};
    }
}

exports.deleteAutomation = async function(consoleHandlers, name) {
    try {
        const automationsForm = JSON.parse(await fspromises.readFile(`${KLOUD_CONSTANTS.FRONTENDROOTDIR}/commands/forms/automations.form.json`, "utf8"));
        const automationLabelName = "Automations"+name.replaceAll(" ", "");
        const automationFileName = "automations_"+name.replaceAll(" ", "").toLowerCase();        
        if (!automationsForm.i18n.en[automationLabelName]) {
            const warning = `Warning in removing automation ${name}. Automation already doesn't exist.`; consoleHandlers.LOGWARN(warning);
            return {...CMD_CONSTANTS.TRUE_RESULT(), out: warning, err: "", stdout: warning, stderr: ""};
        }

        await fspromises.unlink(`${KLOUD_CONSTANTS.FRONTENDROOTDIR}/commands/automations/${automationFileName}.mjs`);
        await fspromises.unlink(`${KLOUD_CONSTANTS.FRONTENDROOTDIR}/commands/forms/${automationFileName}.form.json`);
        await fspromises.unlink(`${KLOUD_CONSTANTS.FRONTENDROOTDIR}/img/${automationFileName}.svg`);
        
        automationsForm.rolelist["!user"] = automationsForm.rolelist["!user"].filter(entry => entry.id != `${automationFileName}`);
        delete automationsForm.i18n.en[automationLabelName]; delete automationsForm.i18n.hi[automationLabelName]; 
        delete automationsForm.i18n.ja[automationLabelName]; delete automationsForm.i18n.zh[automationLabelName]; 
        await fspromises.writeFile(`${KLOUD_CONSTANTS.FRONTENDROOTDIR}/commands/forms/automations.form.json`, JSON.stringify(automationsForm, null, 4), "utf8");

        const out = `Automation ${name} removed.`;
        return {...CMD_CONSTANTS.TRUE_RESULT(), out, err: "", stdout: out, stderr: ""};
    } catch (err) {
        const error = `Error removing automation ${name}. Error is: ${err}.`; consoleHandlers.LOGERROR(error);
        return {...CMD_CONSTANTS.FALSE_RESULT(), out: "", err: error, stdout: "", stderr: error};
    }
}

exports.listAutomations = async function(consoleHandlers) {
    try {
        const automationsForm = JSON.parse(await fspromises.readFile(`${KLOUD_CONSTANTS.FRONTENDROOTDIR}/commands/forms/automations.form.json`, "utf8"));
        const automations = []; for (const entry of automationsForm.rolelist["!user"]) automations.push({name: entry.name, id: entry.id});
        const stdout = JSON.stringify(automations);
        return {...CMD_CONSTANTS.TRUE_RESULT(), out: stdout, err: "", stdout, stderr: "", automations};
    } catch (err) {
        const error = `Error listing automations. Error is: ${err}.`; consoleHandlers.LOGERROR(error);
        return {...CMD_CONSTANTS.FALSE_RESULT(), out: "", err: error, stdout: "", stderr: error, automations: null};
    }
}