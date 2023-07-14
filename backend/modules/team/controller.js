const _ = require('lodash')
const Team = require('./model')
const Registration = require('../registration/model')
const UserProfileController = require('../user-profile/controller')
const {
    InsufficientPrivilegesError,
    ForbiddenError,
    NotFoundError,
} = require('../../common/errors/errors')

const controller = {}

controller.getRoles = (eventId, code) => {
    return controller.getTeamByCode(eventId, code).then(team => {
        return team.roles
    })
}

controller.createTeam = (eventId, userId) => {
    const team = new Team({
        event: eventId,
        owner: userId,
    })

    return team.save()
}

controller.createNewTeam = (data, eventId, userId) => {
    // TODO abstract this deconstruction
    const {
        members,
        teamRoles,
        name,
        tagline,
        description,
        challenge,
        ideaTitle,
        ideaDescription,
        email,
        telegram,
        discord,
    } = data
    const team = new Team({
        event: eventId,
        owner: userId,
        members,
        teamRoles: teamRoles.map(role => ({
            role,
        })),
        name,
        tagline,
        description,
        challenge,
        ideaTitle,
        ideaDescription,
        email,
        telegram,
        discord,
    })

    return team.save()
}

controller.deleteTeam = (eventId, userId) => {
    return controller.getTeam(eventId, userId).then(team => {
        if (team.owner !== userId) {
            throw new InsufficientPrivilegesError(
                'Only the team owner can delete a team.',
            )
        }
        return team.remove()
    })
}

controller.editTeam = (eventId, userId, edits) => {
    return controller.getTeam(eventId, userId).then(team => {
        if (team.owner !== userId) {
            throw new InsufficientPrivilegesError(
                'Only the team owner can edit a team.',
            )
        }
        if (edits.teamRoles && edits.teamRoles.length > 0) {
            if (typeof edits.teamRoles[0] === 'object') {
                edits.teamRoles = [...team.teamRoles]
            } else {
                const currentTeamRoles = team.teamRoles.map(role => {
                    return role.role
                })
                const compareRolesToAdd = _.difference(
                    edits.teamRoles,
                    currentTeamRoles,
                )
                const compareRolesToRemove = _.difference(
                    currentTeamRoles,
                    edits.teamRoles,
                )
                edits.teamRoles = [
                    ..._.reject(team.teamRoles, role =>
                        _.includes(compareRolesToRemove, role.role),
                    ),
                    ..._.filter(edits.teamRoles, role =>
                        _.includes(compareRolesToAdd, role),
                    ).map(role => ({ role })),
                ]
            }
        } else {
            edits.teamRoles = []
        }
        return Team.updateAllowed(team, edits)
    })
}

controller.joinTeam = (eventId, userId, code) => {
    return controller.getTeamByCode(eventId, code).then(team => {
        // TODO HIGH PRIORITY team size defined in event
        if (team.members.length >= 4) {
            throw new ForbiddenError('Teams can have at most 5 members')
        }
        team.members = team.members.concat(userId)
        return team.save()
    })
}

controller.candidateApplyToTeam = (eventId, userId, code, applicationData) => {
    // const team = controller.getTeam(eventId, applicationData.teamId)
    console.log('Application data:', applicationData)
    console.log('User id:', userId)
    console.log('Event id:', eventId)
    console.log('Code:', code)
    return controller
        .getTeamByCode(eventId, code)
        .then(team => {
            console.log('team before action', team)
            if (
                !_.includes(team.members, userId) &&
                !_.includes(
                    team.candidates.map(candidate => candidate.userId),
                    userId,
                ) &&
                team.owner !== userId
            ) {
                team.candidates = team.candidates.concat(applicationData)
                return team
            } else {
                throw new NotFoundError('You are already in this team')
            }
        })
        .then(team => {
            console.log('team after action', team)
        })
    return 'test'
}

controller.leaveTeam = (eventId, userId) => {
    return controller.getTeam(eventId, userId).then(team => {
        team.members = team.members.filter(member => member !== userId)
        if (team.members.length === 0) {
            controller.deleteTeam(eventId, userId)
        } else {
            return team.save()
        }
    })
}

controller.removeMemberFromTeam = (eventId, userId, userToRemove) => {
    return controller.getTeam(eventId, userId).then(team => {
        if (team.owner !== userId) {
            throw new InsufficientPrivilegesError(
                'Only the team owner can remove members',
            )
        }
        team.members = team.members.filter(member => member !== userToRemove)
        return team.save()
    })
}

controller.getTeamById = teamId => {
    return Team.findById(teamId).then(team => {
        if (!team) {
            throw new NotFoundError('No team exists for this Id')
        }
        return team
    })
}

controller.getTeamByCode = (eventId, code) => {
    return Team.findOne({
        event: eventId,
        code,
    }).then(team => {
        if (!team) {
            throw new NotFoundError('No team exists for this code and event')
        }
        return team
    })
}

controller.getTeam = (eventId, userId) => {
    return Team.findOne({
        event: eventId,
    })
        .or([{ owner: userId }, { members: userId }])
        .then(team => {
            if (!team) {
                throw new NotFoundError(
                    'No team exists for this user and event',
                )
            }
            return team
        })
}

controller.getTeamMembers = teamId => {
    return Team.findOne({
        _id: teamId,
    }).then(team => {
        if (!team) {
            throw new NotFoundError(`No team found with id ${teamId}`)
        }
        return [team.owner].concat(team.members)
    })
}

controller.attachMeta = async team => {
    const userIds = [team.owner].concat(team.members)
    const [registrations, userProfiles] = await Promise.all([
        Registration.find({ event: team.event, user: { $in: userIds } }),
        UserProfileController.getUserProfilesPublic(userIds),
    ])

    const userIdsToRemove = []
    const meta = userIds.reduce((res, userId) => {
        const registration = _.find(
            registrations,
            registration => registration.user === userId,
        )
        const profile = _.find(
            userProfiles,
            profile => profile.userId === userId,
        )

        if (!registration || !profile) {
            userIdsToRemove.push(userId)
            return res
        }
        res[userId] = {
            registration: {
                status: registration.status,
            },
            profile,
        }
        return res
    }, {})

    let result

    if (userIdsToRemove.length > 0) {
        // For whatever reason, some team members no longer exist -> remove missing team members
        team.members = team.toJSON().members.filter(member => {
            if (userIdsToRemove.indexOf(member) !== -1) {
                return false
            }
            return true
        })

        if (userIdsToRemove.indexOf(team.owner) !== -1) {
            // If the owner no longer exists
            if (team.members.length > 0) {
                // If there are still members left, promote first member to owner
                team.owner = team.members[0]
                team.members = team.members.slice(1)
            } else {
                // If there are no members left either, delete the team
                team.remove()
                // Throw not found error
                throw new NotFoundError(
                    'No team exists for this user and event',
                )
            }
        }
        team.save()
    }

    result = team.toJSON()
    result.meta = meta

    return result
}

controller.getTeamsForEvent = eventId => {
    return Team.find({
        event: eventId,
    })
    // TODO make the code not visible to participants on Redux store
}

controller.getTeamStatsForEvent = async eventId => {
    const numTeams = await Team.countDocuments({
        event: eventId,
    })

    return {
        numTeams,
    }
}

controller.exportTeams = async teamIds => {
    const teams = await Team.find({ _id: { $in: teamIds } })
    const teamsWithMeta = await Promise.all(
        teams.map(team => controller.attachMeta(team)),
    )

    return teamsWithMeta.map(controller.convertToFlatExportData)
}

controller.convertToFlatExportData = teamWithMeta => {
    return {
        teamCode: teamWithMeta.code,
        teamMembers: Object.values(teamWithMeta.meta)
            .map(memberMeta => memberMeta.profile)
            .map(
                memberProfile =>
                    `${memberProfile.firstName} ${memberProfile.lastName} <${memberProfile.email}>`,
            )
            .join(', '),
    }
}

module.exports = controller
