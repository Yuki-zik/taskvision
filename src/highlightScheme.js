function clone(value) {
    return value ? JSON.parse(JSON.stringify(value)) : {};
}

function shouldClear(scheme) {
    return scheme === undefined || scheme === null || scheme === '' || scheme === 'none';
}

function applyScheme(target, scheme) {
    if (!target || typeof target !== 'object') {
        return;
    }
    if (shouldClear(scheme)) {
        delete target.scheme;
    } else {
        target.scheme = scheme;
    }
}

function applySchemeToAllTags(customHighlight, defaultHighlight, scheme) {
    var updatedCustom = clone(customHighlight);
    var updatedDefault = clone(defaultHighlight);

    Object.keys(updatedCustom).forEach(function (tag) {
        applyScheme(updatedCustom[tag], scheme);
    });

    applyScheme(updatedDefault, scheme);

    return { customHighlight: updatedCustom, defaultHighlight: updatedDefault };
}

module.exports.applySchemeToAllTags = applySchemeToAllTags;
